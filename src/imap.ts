/**
 * IMAP against a mailbox the agent owns — the front door.
 *
 * The user's provider stops mattering here: whatever they cc or forward from arrives as mail in this
 * one mailbox, so a single adapter covers Outlook, Google, Fastmail, Proton Bridge and every other
 * host, and nobody has to register an application or ask an administrator for anything.
 *
 * Three rules this file keeps:
 *   - it never marks a message read (no `\Seen` is ever set, so the mailbox looks untouched)
 *   - it never deletes anything
 *   - it never moves a message
 *
 * The cursor is the mailbox's `uidValidity` plus the highest UID delivered. If `uidValidity` changes,
 * every UID the cursor holds is meaningless and the source starts again — which is why the value is
 * kept rather than just the number.
 */

import { ImapFlow } from "imapflow";
import { type Cursor, type Envelope, type MailSource, envelopeOf } from "./source.ts";

/** The subset of ImapFlow this source uses, so a test can supply its own. */
export interface ImapClient {
	connect(): Promise<void>;
	getMailboxLock(path: string): Promise<{ release(): void }>;
	mailbox?: { uidValidity: bigint; exists: number } | undefined;
	search(query: Record<string, unknown>, options: { uid: true }): Promise<number[] | false | undefined>;
	fetchAll(range: string, query: { uid: true; source: true }): Promise<{ uid: number; source?: Buffer }[]>;
	fetchOne(seq: string, query: { uid: true; source: true }, options: { uid: true }): Promise<{ uid: number; source?: Buffer } | false | undefined>;
	logout(): Promise<void>;
}

export interface ImapOptions {
	host: string;
	port?: number;
	user: string;
	password: string;
	mailbox?: string;
	/** Where a first sync starts. Without it, the first pass takes the newest messages only. */
	since?: string;
	/** Injected by the check; the real thing is ImapFlow. */
	connect?: (options: ImapOptions) => ImapClient;
}

/** A mailbox belongs to a person, not to us: on a first run, take the newest, never the lot. */
const FIRST_PASS_MESSAGES = 50;

interface CursorShape {
	uidValidity?: string;
	lastUid?: number;
}

/**
 * Does this login actually work? Used by the setup wizard, which should fail in front of the person
 * typing rather than the first time the service runs.
 */
export async function verifyImap(options: ImapOptions): Promise<{ messages: number }> {
	const source = imapSource("verify", options);
	try {
		return await source.count();
	} finally {
		await source.close();
	}
}

export function imapSource(account: string, options: ImapOptions): MailSource & { count(): Promise<{ messages: number }> } {
	let client: ImapClient | undefined;
	/** Sources fetched during a pass and not yet asked for by id. */
	const held = new Map<string, string>();
	const doConnect =
		options.connect ??
		(({ host, port, user, password }: ImapOptions) =>
			new ImapFlow({
				host,
				port: port ?? 993,
				secure: true,
				auth: { user, pass: password },
				logger: false,
			}) as unknown as ImapClient);

	async function connected(): Promise<ImapClient> {
		if (client) return client;
		const fresh = doConnect(options);
		await fresh.connect();
		client = fresh;
		return fresh;
	}

	async function withMailbox<T>(work: (imap: ImapClient) => Promise<T>): Promise<T> {
		const imap = await connected();
		const lock = await imap.getMailboxLock(options.mailbox ?? "INBOX");
		try {
			return await work(imap);
		} catch (error) {
			// A dropped connection looks like any other failure from here, and keeping the dead client
			// would fail every later pass until the process restarted. Drop it so the next pass
			// reconnects, and let the caller see what happened.
			if (client === imap) client = undefined;
			void imap.logout().catch(() => {});
			throw error;
		} finally {
			try {
				lock.release();
			} catch {
				// The connection is gone; there is nothing left to release.
			}
		}
	}

	return {
		async listNew(cursor: Cursor | undefined) {
			return withMailbox(async (imap) => {
				const uidValidity = String(imap.mailbox?.uidValidity ?? "");
				const highest = Number(imap.mailbox?.exists ?? 0);
				const previous = cursor as CursorShape | undefined;
				const resuming = previous?.uidValidity === uidValidity && typeof previous.lastUid === "number";

				let uids: number[];
				if (resuming) {
					const found = (await imap.search({ uid: `${(previous.lastUid as number) + 1}:*` }, { uid: true })) || [];
					// `n:*` includes the highest message even when it is below n, so it comes back out.
					uids = found.filter((uid) => uid > (previous.lastUid as number));
				} else if (options.since) {
					const found = (await imap.search({ since: new Date(options.since), uid: "1:*" }, { uid: true })) || [];
					uids = found.filter((uid) => uid > 0);
				} else {
					const from = Math.max(1, highest - FIRST_PASS_MESSAGES + 1);
					const recent = await imap.fetchAll(`${from}:*`, { uid: true, source: true });
					uids = recent.map((message) => message.uid);
					for (const message of recent) {
						if (message.source) held.set(String(message.uid), message.source.toString("utf8"));
					}
				}

				const envelopes: Envelope[] = [];
				for (const uid of uids) {
					const cached = held.get(String(uid));
					if (cached) {
						envelopes.push({ ...envelopeOf(cached), id: String(uid) });
						continue;
					}
					const message = await imap.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
					if (!message?.source) continue;
					const raw = message.source.toString("utf8");
					held.set(String(uid), raw);
					envelopes.push({ ...envelopeOf(raw), id: String(uid) });
				}

				return {
					envelopes,
					cursor: {
						uidValidity,
						// The highest UID seen, not the highest delivered: a message that could not be
						// read this pass must not be skipped forever.
						lastUid: Math.max(previous?.lastUid ?? 0, ...uids, 0),
						account,
						mailbox: options.mailbox ?? "INBOX",
					} satisfies Cursor,
				};
			});
		},

		async fetch(id: string) {
			const cached = held.get(id);
			if (cached) {
				held.delete(id);
				return cached;
			}
			const message = await withMailbox((imap) => imap.fetchOne(id, { uid: true, source: true }, { uid: true }));
			if (!message?.source) throw new Error(`no IMAP message with uid ${id} in ${options.mailbox ?? "INBOX"}`);
			return message.source.toString("utf8");
		},

		async close() {
			const open = client;
			client = undefined;
			held.clear();
			if (open) await open.logout().catch(() => {});
		},

		/** One look at the mailbox, for setup: proves the host, the user and the password together. */
		async count() {
			return withMailbox(async (imap) => ({ messages: Number(imap.mailbox?.exists ?? 0) }));
		},
	};
}
