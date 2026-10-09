/**
 * The wake half's logic, kept out of the extension so it can be tested without pi: what has not
 * been delivered yet, what the pointer says, and whether a message carries something the agent
 * should not act on by itself.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { accountDir, readIndex, type StoredMessage } from "./spool.ts";
import { originalSender } from "./source.ts";

export interface Pending {
	/** Index line the message sits on, which is also the delivery cursor. */
	line: number;
	message: StoredMessage;
}

/**
 * Everything past the last line already delivered. A line count rather than a list of ids, so a
 * restart neither repeats nor skips, and it costs one small file per account.
 */
export function undelivered(account: string): Pending[] {
	const delivered = readDelivered(account);
	return readIndex(account)
		.map((message, index) => ({ line: index + 1, message }))
		.filter((pending) => pending.line > delivered);
}

export function markDelivered(account: string, line: number): void {
	writeFileSync(join(accountDir(account), "delivered.json"), JSON.stringify({ line }));
}

function readDelivered(account: string): number {
	const file = join(accountDir(account), "delivered.json");
	if (!existsSync(file)) return 0;
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as { line?: number };
		return typeof parsed.line === "number" ? parsed.line : 0;
	} catch {
		// A torn cursor repeats wakes the agent already had. A repeated turn is cheap; a skipped
		// message is not, so this falls back to the safe direction.
		return 0;
	}
}

export function readRaw(account: string, message: StoredMessage): string {
	return readFileSync(join(accountDir(account), message.file), "utf8");
}

/** The pointer: who, what, when, and the file to read. The body stays in the file. */
export function pointer(account: string, message: StoredMessage, raw?: string): string {
	const who = message.from.name ? `${message.from.name} <${message.from.address}>` : message.from.address;
	// A forward carries the forwarder as its sender and the real author inside the body. Saying
	// nothing about that would make the pointer wrong about who wrote it.
	const original = raw ? originalSender(raw, { ...message, id: message.id }) : undefined;
	const forwarded = original
		? ` (forwarded${original.name ? ` by ${message.from.address}` : ""} · originally from ${original.name ?? original.address})`
		: "";
	return [
		`[email] ${who}${forwarded} · ${message.subject || "(no subject)"}`,
		`${message.receivedAt} · ${account} · ${join(accountDir(account), message.file)}`,
	].join("\n");
}

/**
 * A link or an attachment is how a stranger's message reaches past the transcript and into the
 * machine, so those are the turns the agent should not act on unattended.
 */
export function needsCare(raw: string): boolean {
	// shortcut: an attachment is spotted by its headers rather than by walking the MIME tree, and a
	// URL is looked for in the body only.
	return /content-disposition:\s*attachment/i.test(raw) || /filename=/i.test(raw) || /https?:\/\//i.test(bodyOf(raw));
}

function bodyOf(raw: string): string {
	const [, ...rest] = raw.split(/\r?\n\r?\n/);
	return rest.join("\n\n");
}
