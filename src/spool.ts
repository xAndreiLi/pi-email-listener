/**
 * The spool: the only interface between a mailbox and anything that reads mail.
 *
 * Per account, under the pi agent directory:
 *
 *   <mail dir>/<account>/index.jsonl    append-only, one StoredMessage per line
 *   <mail dir>/<account>/<file>         the message exactly as it arrived
 *   <mail dir>/<account>/cursor.json    the source's sync position, opaque here
 *
 * Nothing here needs a session, so the fetcher runs with or without one.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentDir } from "./config.ts";
import type { Cursor } from "./source.ts";

export interface Address {
	name?: string;
	address: string;
}

/** One stored message. This is what a wake points at, so it stays cheap and self-contained. */
export interface StoredMessage {
	id: string;
	account: string;
	receivedAt: string;
	from: Address;
	to: string[];
	cc: string[];
	subject: string;
	/** File name inside the account directory. */
	file: string;
	bytes: number;
}

export function mailRoot(): string {
	return process.env.PI_EMAIL_LISTENER_MAIL_DIR ?? join(agentDir(), "mail");
}

export function accountDir(account: string): string {
	const dir = join(mailRoot(), account);
	mkdirSync(dir, { recursive: true });
	return dir;
}

/** Write the raw message and its index line. Never overwrites a file that is already there. */
export function storeMessage(account: string, message: StoredMessage, raw: string): StoredMessage {
	const dir = accountDir(account);
	const stored = { ...message, file: freeFileName(dir, message.file) };
	writeFileSync(join(dir, stored.file), raw);
	appendFileSync(join(dir, "index.jsonl"), `${JSON.stringify(stored)}\n`);
	return stored;
}

export function readIndex(account: string): StoredMessage[] {
	const file = join(accountDir(account), "index.jsonl");
	if (!existsSync(file)) return [];
	return readFileSync(file, "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as StoredMessage);
}

export function readCursor(account: string): Cursor | undefined {
	const file = join(accountDir(account), "cursor.json");
	if (!existsSync(file)) return undefined;
	try {
		return JSON.parse(readFileSync(file, "utf8")) as Cursor;
	} catch {
		// A torn cursor costs one re-scan of messages the index already holds, not a lost message.
		return undefined;
	}
}

export function writeCursor(account: string, cursor: Cursor): void {
	writeFileSync(join(accountDir(account), "cursor.json"), JSON.stringify(cursor));
}

/** Two messages can share a name once an id is squeezed into a file name; losing one is not an option. */
function freeFileName(dir: string, wanted: string): string {
	if (!existsSync(join(dir, wanted))) return wanted;
	const base = wanted.replace(/\.eml$/i, "");
	for (let n = 2; ; n++) {
		const candidate = `${base}-${n}.eml`;
		if (!existsSync(join(dir, candidate))) return candidate;
	}
}
