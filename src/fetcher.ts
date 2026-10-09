/**
 * The fetcher: the always-on half of pi-email-listener.
 *
 * It owns the provider connection and the sync position, and its only output is spool files. It
 * needs no pi session, and nothing downstream can tell whether one was open while it ran.
 *
 *   npm run fetch          poll forever
 *   npm run fetch:once     one pass per account, then exit
 */

import { createHash } from "node:crypto";
import { type AccountConfig, loadConfig } from "./config.ts";
import { graphSource } from "./graph.ts";
import { accessTokenFor } from "./microsoft-auth.ts";
import { type MailSource, fixtureSource } from "./source.ts";
import { accountDir, readCursor, readIndex, storeMessage, writeCursor } from "./spool.ts";

const log = (line: string) => process.stdout.write(`${new Date().toISOString()} ${line}\n`);

export function sourceFor(account: AccountConfig): MailSource {
	switch (account.provider) {
		case "fixture":
			if (!account.dir) throw new Error(`account "${account.name}" is a fixture and needs a "dir"`);
			return fixtureSource(account.dir);
		case "graph":
			if (!account.clientId) {
				throw new Error(`account "${account.name}" needs a "clientId" from an Entra app registration to use provider graph`);
			}
			return graphSource(account.name, {
				mailbox: account.mailbox,
				folder: account.folder,
				since: account.since,
				accessToken: () => accessTokenFor(account.name),
			});
		default:
			throw new Error(
				`account "${account.name}" asks for provider "${account.provider}", which does not exist yet — available: fixture, graph`,
			);
	}
}

/** One pass over an account: everything the cursor has not seen becomes a spool file. */
export async function syncAccount(account: AccountConfig, source = sourceFor(account)): Promise<number> {
	accountDir(account.name);
	const known = new Set(readIndex(account.name).map((message) => message.id));
	const { envelopes, cursor } = await source.listNew(readCursor(account.name));
	let stored = 0;
	for (const envelope of envelopes) {
		if (known.has(envelope.id)) continue;
		const raw = await source.fetch(envelope.id);
		const message = storeMessage(
			account.name,
			{ ...envelope, account: account.name, file: safeName(envelope.id), bytes: Buffer.byteLength(raw) },
			raw,
		);
		known.add(envelope.id);
		stored++;
		log(
			`[${account.name}] stored ${message.receivedAt} · ${message.from.address} · ${message.subject || "(no subject)"} → ${message.file}`,
		);
	}
	// The cursor is the adapter's, so it is stored whatever shape it is in — including a cursor
	// that only moved because a page was consumed.
	if (Object.keys(cursor).length > 0) writeCursor(account.name, cursor);
	return stored;
}

/** The id is a provider's, so it has to become a file name without colliding or carrying a path. */
function safeName(id: string): string {
	const cleaned = id.replace(/[^A-Za-z0-9._-]/g, "-").replace(/\.eml$/i, "");
	if (cleaned.length <= 64) return `${cleaned || "message"}.eml`;
	// Message ids from one mailbox share a long prefix, so a sliced id would make every file in the
	// spool differ only by its collision suffix. The tail carries the identity instead.
	return `${cleaned.slice(0, 48)}-${createHash("sha1").update(id).digest("hex").slice(0, 8)}.eml`;
}

export async function run(argv = process.argv.slice(2)): Promise<void> {
	const once = argv.includes("--once");
	const config = loadConfig();
	const accounts = config.accounts.map((account) => ({ account, source: sourceFor(account) }));
	for (;;) {
		for (const { account, source } of accounts) {
			try {
				const stored = await syncAccount(account, source);
				if (stored === 0) log(`[${account.name}] nothing new`);
			} catch (error) {
				// One broken account must not stop the others; the next pass is the retry.
				// shortcut: no backoff, so a dead account is retried once per poll interval.
				log(`[${account.name}] ${(error as Error).message}`);
			}
		}
		if (once) return;
		await new Promise((resolve) => setTimeout(resolve, config.pollSeconds * 1000));
	}
}
