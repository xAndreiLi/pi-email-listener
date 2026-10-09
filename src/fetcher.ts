/**
 * The fetcher: the always-on half of pi-email-listener.
 *
 * It owns the provider connection and the sync position, and its only output is spool files. It
 * needs no pi session, and nothing downstream can tell whether one was open while it ran.
 *
 *   npm run fetch          poll forever
 *   npm run fetch:once     one pass per account, then exit
 */

import { type AccountConfig, loadConfig } from "./config.ts";
import { type MailSource, fixtureSource } from "./source.ts";
import { accountDir, readCursor, readIndex, storeMessage, writeCursor } from "./spool.ts";

const log = (line: string) => process.stdout.write(`${new Date().toISOString()} ${line}\n`);

export function sourceFor(account: AccountConfig): MailSource {
	switch (account.provider) {
		case "fixture":
			if (!account.dir) throw new Error(`account "${account.name}" is a fixture and needs a "dir"`);
			return fixtureSource(account.dir);
		default:
			throw new Error(
				`account "${account.name}" asks for provider "${account.provider}", which does not exist yet — available: fixture`,
			);
	}
}

/** One pass over an account: everything the cursor has not seen becomes a spool file. */
export async function syncAccount(account: AccountConfig, source = sourceFor(account)): Promise<number> {
	accountDir(account.name);
	const known = new Set(readIndex(account.name).map((message) => message.id));
	const envelopes = await source.listNew(readCursor(account.name));
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
	const newest = envelopes.at(-1)?.receivedAt;
	if (newest) writeCursor(account.name, { lastSeenAt: newest });
	return stored;
}

/** The id is a provider's, so it has to become a file name without colliding or carrying a path. */
function safeName(id: string): string {
	const cleaned = id.replace(/[^A-Za-z0-9._-]/g, "-").replace(/\.eml$/i, "").slice(0, 80);
	return `${cleaned || "message"}.eml`;
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
