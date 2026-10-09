/**
 * Offline check for the IMAP source: a stubbed server, the real spool, the real fetcher.
 *
 *   npm run imap-check
 *
 * The stub is not imapflow — it is the old mailbox itself, answering the three things this source
 * asks of a server (search a UID range, fetch sources, hand over uidValidity). That keeps the check
 * offline while still exercising the parts that are ours: the cursor, the first pass, the reset when
 * uidValidity moves, and the promise that reading mail never changes it.
 */

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-email-listener-imap-"));
mkdirSync(join(root, "mail"), { recursive: true });
process.env.PI_EMAIL_LISTENER_MAIL_DIR = join(root, "mail");

const { imapSource } = await import("../src/imap.ts");
const { syncAccount } = await import("../src/fetcher.ts");
const { readCursor, readIndex } = await import("../src/spool.ts");
const { originalSender } = await import("../src/source.ts");
const { pointer } = await import("../src/wake.ts");

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}

const raw = (subject: string, from = "Dana Whitfield <dana@example.com>", extra: string[] = []) =>
	[
		`From: ${from}`,
		"To: agent@example.com",
		`Subject: ${subject}`,
		"Date: Fri, 09 Oct 2026 14:32:07 +0200",
		`Message-ID: <${subject.replace(/\W/g, "-")}@example.com>`,
		...extra,
		"",
		"Body of the message.",
	].join("\r\n");

/** The mailbox the source will read, with every call recorded so the check can assert on them. */
function stubServer(messages: { uid: number; source: string }[], uidValidity = 7n) {
	const calls: string[] = [];
	let loggedOut = false;
	const client = {
		failNext: 0,
		mailbox: { uidValidity, exists: messages.length },
		async connect() {
			calls.push("connect");
		},
		async getMailboxLock(path: string) {
			calls.push(`lock:${path}`);
			return { release: () => calls.push("unlock") };
		},
		async search(query: Record<string, unknown>, _options: { uid: true }) {
			const range = String(query.uid ?? "");
			calls.push(`search:${range}`);
			const from = Number(range.split(":")[0]);
			// IMAP semantics: `n:*` always returns the highest message, even when it is below n.
			const found = messages.map((one) => one.uid).filter((uid) => uid >= from);
			return found.length ? found : [messages.at(-1)?.uid ?? 0];
		},
		async fetchAll(range: string, _query: unknown) {
			calls.push(`fetchAll:${range}`);
			if (client.failNext > 0) {
				client.failNext--;
				throw new Error("connection lost");
			}
			const from = Number(range.split(":")[0]);
			return messages.filter((one) => one.uid >= from).map((one) => ({ uid: one.uid, source: Buffer.from(one.source) }));
		},
		async fetchOne(seq: string, _query: unknown, _options: unknown) {
			calls.push(`fetchOne:${seq}`);
			const found = messages.find((one) => String(one.uid) === String(seq));
			return found ? { uid: found.uid, source: Buffer.from(found.source) } : false;
		},
		async logout() {
			loggedOut = true;
			calls.push("logout");
		},
		// Present so a call would be visible rather than a TypeError: reading must not mark anything.
		async messageFlagsAdd() {
			calls.push("MESSAGE_FLAGS_ADD");
			throw new Error("the source must never change a message's flags");
		},
		async messageDelete() {
			calls.push("MESSAGE_DELETE");
			throw new Error("the source must never delete a message");
		},
	};
	return { client, calls, loggedOut: () => loggedOut };
}

const account = { name: "agent", provider: "imap", host: "imap.example.com", user: "agent@example.com" };

// ---------------------------------------------------------------- first pass

const first = stubServer([
	{ uid: 1, source: raw("old news") },
	{ uid: 2, source: raw("Q3 rollout") },
]);
const source = imapSource("agent", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => first.client as never,
});

check("the first pass stores what is in the mailbox", (await syncAccount(account, source)) === 2);
check("and it opened the inbox", first.calls.some((call) => call === "lock:INBOX"));
check("the cursor keeps the uidValidity and the highest uid", readCursor("agent")?.uidValidity === "7" && readCursor("agent")?.lastUid === 2);
check("the mailbox was left alone", first.calls.every((call) => call !== "MESSAGE_FLAGS_ADD" && call !== "MESSAGE_DELETE"));

// ---------------------------------------------------------------- second pass, then a new arrival

check("a second pass stores nothing", (await syncAccount(account, source)) === 0);
check("and it asked from the uid after the last one", first.calls.filter((call) => call.startsWith("search:")).at(-1) === "search:3:*");
check(
	"the message the server re-offers for an empty range is not stored twice",
	readIndex("agent").length === 2,
);

first.client.mailbox = { uidValidity: 7n, exists: 3 };
first.calls.length = 0;
const second = stubServer([{ uid: 3, source: raw("Fresh arrival") }]);
const freshSource = imapSource("agent", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => second.client as never,
});
check("a message that arrives later is fetched by uid", (await syncAccount(account, freshSource)) === 1);
check("by asking for the source of that uid", second.calls.includes("fetchOne:3"));
check("and the cursor moves on", readCursor("agent")?.lastUid === 3);

// ---------------------------------------------------------------- uidValidity moved

const moved = stubServer([{ uid: 3, source: raw("After a rebuild") }], 9n);
const movedSource = imapSource("agent", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => moved.client as never,
});
await syncAccount(account, movedSource);
check("a changed uidValidity starts again rather than trusting stale uids", moved.calls.some((call) => call.startsWith("fetchAll:") || call.startsWith("search:1:*")));
check("and the new uidValidity is kept", readCursor("agent")?.uidValidity === "9");

// ---------------------------------------------------------------- reading a forwarded message

const forwarded = [
	raw("Fwd: Invoice 2201", "Andrei Li <andrei@example.com>"),
	"",
	"---------- Forwarded message ----------",
	"From: Billing <billing@vendor.example>",
	"Date: Thu, 08 Oct 2026 09:00:00 +0200",
	"Subject: Invoice 2201",
	"",
	"Please pay.",
].join("\r\n");
const envelope = { ...readIndex("agent")[0], from: { name: "Andrei Li", address: "andrei@example.com" }, subject: "Fwd: Invoice 2201" };
const original = originalSender(forwarded, envelope as never);
check("a forwarded message gives up its real author", original?.address === "billing@vendor.example");
check("and the pointer says so", pointer("agent", envelope as never, forwarded).includes("originally from"));
check("a plain message claims no forwarding", originalSender(raw("Plain"), { ...envelope, subject: "Plain" } as never) === undefined);

// ---------------------------------------------------------------- the connection is ours to close

// A dead connection must not be kept: the next pass has to reconnect rather than fail forever.
const flaky = stubServer([{ uid: 1, source: raw("After a reconnect") }]);
const flakySource = imapSource("flaky", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => flaky.client as never,
});
flaky.client.failNext = 1;
let surfaced = false;
try {
	await syncAccount({ ...account, name: "flaky" }, flakySource);
} catch {
	surfaced = true;
}
check("a dropped connection surfaces as an error rather than silence", surfaced);
check("the dead client is dropped", flaky.calls.filter((call) => call === "connect").length === 1);
check("and the next pass connects again", (await syncAccount({ ...account, name: "flaky" }, flakySource)) === 1);
check("which is the second connect", flaky.calls.filter((call) => call === "connect").length === 2);

await source.close();
check("closing the source logs out", first.loggedOut());

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
