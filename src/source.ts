/**
 * A mail source is a provider adapter reduced to two calls.
 *
 * The cursor is the adapter's own sync position and this code never interprets it: an IMAP
 * adapter keeps its UIDVALIDITY and last UID there, Graph keeps a delta link, the fixture keeps
 * the newest date it has seen.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Address } from "./spool.ts";

export interface Envelope {
	id: string;
	receivedAt: string;
	from: Address;
	to: string[];
	cc: string[];
	subject: string;
}

export type Cursor = Record<string, unknown>;

export interface MailSource {
	/** Everything the cursor has not seen, oldest first, and where the next pass should resume. */
	listNew(cursor: Cursor | undefined): Promise<{ envelopes: Envelope[]; cursor: Cursor }>;
	/** The message exactly as it arrived. */
	fetch(id: string): Promise<string>;
	/** For a source that holds a connection: let it go. */
	close?(): Promise<void>;
}

/**
 * A directory of `.eml` files standing in for a mailbox: enough to watch the spool fill without
 * handing a real account to anything, and enough to test the fetcher without a network.
 */
export function fixtureSource(dir: string): MailSource {
	const mail = () =>
		readdirSync(dir)
			.filter((file) => file.toLowerCase().endsWith(".eml"))
			.map((file) => ({ file, envelope: envelopeOf(readFileSync(join(dir, file), "utf8")) }));
	// Like a provider: the id is the message's own, and the file name is only how it is kept here.
	const idOf = (message: { file: string; envelope: Envelope }) => message.envelope.id || message.file;

	return {
		async listNew(cursor) {
			const since = typeof cursor?.lastSeenAt === "string" ? cursor.lastSeenAt : "";
			const envelopes = mail()
				.filter((message) => message.envelope.receivedAt >= since)
				.map((message) => ({ ...message.envelope, id: idOf(message) }))
				.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
			const newest = envelopes.at(-1)?.receivedAt;
			// Only a message that was actually there moves the cursor on.
			return { envelopes, cursor: newest ? { lastSeenAt: newest } : (cursor ?? {}) };
		},
		async fetch(id) {
			const message = mail().find((candidate) => idOf(candidate) === id);
			if (!message) throw new Error(`no fixture message with id ${id}`);
			return readFileSync(join(dir, message.file), "utf8");
		},
	};
}

/** Headers only, for the pointer. The body is read later, by the agent, from the spool file. */
export function envelopeOf(raw: string): Envelope {
	const headers = parseHeaders(raw);
	return {
		id: headers["message-id"]?.replace(/^<|>$/g, "") ?? "",
		receivedAt: isoDate(headers.date),
		from: parseAddress(headers.from),
		to: parseList(headers.to),
		cc: parseList(headers.cc),
		subject: headers.subject ?? "",
	};
}

/**
 * Who actually wrote the message, when it reached this mailbox as a forward.
 *
 * A forward rewrites the envelope: the top-level From is the person who forwarded it, and the real
 * sender survives only as a quoted header block in the body. Every mail client writes that block
 * differently, so this is a heuristic — it recovers the usual Outlook and Gmail shapes, and returns
 * nothing rather than guessing when it cannot.
 */
export function originalSender(raw: string, envelope: Envelope): Address | undefined {
	if (!/^\s*(fwd?|fw|wg)\s*:/i.test(envelope.subject)) return undefined;
	const body = bodyOf(raw);
	// A quoted header block: "From: …" at the start of a line, followed by another header line.
	const match = body.match(/^[ \t>]*From:[ \t]*(.+)$/im);
	if (!match?.[1]) return undefined;
	const candidate = parseAddress(match[1].trim());
	if (!candidate.address.includes("@")) return undefined;
	// The forwarder repeating their own address is not the original sender.
	if (candidate.address.toLowerCase() === envelope.from.address.toLowerCase()) return undefined;
	return candidate;
}

function bodyOf(raw: string): string {
	const [, ...rest] = raw.split(/\r?\n\r?\n/);
	return rest.join("\n\n");
}

function parseHeaders(raw: string): Record<string, string> {
	const [head = ""] = raw.split(/\r?\n\r?\n/, 1);
	const headers: Record<string, string> = {};
	let key = "";
	for (const line of head.split(/\r?\n/)) {
		if (/^[ \t]/.test(line)) {
			if (key) headers[key] = `${headers[key]} ${line.trim()}`;
			continue;
		}
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		key = line.slice(0, colon).trim().toLowerCase();
		headers[key] = line.slice(colon + 1).trim();
	}
	return headers;
}

// shortcut: no RFC 2047 decoding, so a non-ASCII subject or name reads as =?UTF-8?B?...?=; add a decoder when a real mailbox shows non-ASCII.
function parseAddress(value = ""): Address {
	const angled = value.match(/^(.*?)<([^>]+)>/);
	if (angled) {
		const name = angled[1].trim().replace(/^"|"$/g, "");
		return { ...(name ? { name } : {}), address: angled[2].trim() };
	}
	return { address: value.trim() };
}

// shortcut: splits on every comma, so a quoted display name containing one becomes two entries.
function parseList(value = ""): string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function isoDate(value?: string): string {
	const parsed = value ? new Date(value) : new Date(0);
	return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}
