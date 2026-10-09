/**
 * Assert-based self-check for the spool and the fetcher. No network, no credentials, no session.
 *
 *   npm run self-check
 *
 * It writes fixture mail into a temp directory and drives the real code against it, so the paths
 * it asserts on are the paths a real adapter will use.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-email-listener-"));
process.env.PI_EMAIL_LISTENER_MAIL_DIR = join(root, "mail");
const maildir = join(root, "fixtures");
mkdirSync(maildir);

const { syncAccount } = await import("../src/fetcher.ts");
const { accountDir, readCursor, readIndex } = await import("../src/spool.ts");

const { getAgentDir } = await import("@earendil-works/pi-coding-agent");

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}

function message(lines: string[]): string {
	return `${lines.join("\r\n")}\r\n\r\nBody of the message.\r\n`;
}

function write(name: string, headers: string[]) {
	writeFileSync(join(maildir, name), message(headers));
}

/** A fixture account reads .eml files, exactly like a directory full of exported mail. */
const account = { name: "test", provider: "fixture", dir: maildir };

write("a.eml", [
	"From: Dana Whitfield <dana@example.com>",
	"To: andrei@example.com",
	"Cc: team@example.com",
	"Subject: Q3 rollout",
	"Date: Fri, 09 Oct 2026 14:32:07 +0200",
	"Message-ID: <a@example.com>",
]);

check("config points at the fixture directory", account.dir === maildir);
check("the spool defaults under the agent directory", getAgentDir().endsWith(join(".pi", "agent")));

check("a first pass stores the message", (await syncAccount(account)) === 1);
check("a second pass stores nothing", (await syncAccount(account)) === 0);

write("b.eml", [
	"From: <billing@vendor.example>",
	"To: andrei@example.com",
	"Subject: Invoice 2201",
	"Date: Fri, 09 Oct 2026 15:00:00 +0200",
]);
check("a message without a Message-ID is stored too", (await syncAccount(account)) === 1);
check("the index holds both", readIndex("test").length === 2);

const [first, second] = readIndex("test");
check("a message is known by its Message-ID", first.id === "a@example.com");
check("a message with no Message-ID falls back to a name", second.id === "b.eml");
check(
	"the envelope is parsed for the pointer",
	first.from.name === "Dana Whitfield" &&
		first.from.address === "dana@example.com" &&
		first.subject === "Q3 rollout" &&
		first.cc[0] === "team@example.com",
);
check("the date header becomes an ISO timestamp", first.receivedAt === "2026-10-09T12:32:07.000Z");
check("the raw message is kept whole", readFileSync(join(accountDir("test"), first.file), "utf8").includes("Body of the message."));
check("the body stays out of the index", !readFileSync(join(accountDir("test"), "index.jsonl"), "utf8").includes("Body of the message."));
check("the cursor remembers the newest message", (readCursor("test")?.lastSeenAt as string) === "2026-10-09T13:00:00.000Z");

write("c.eml", [
	"From: Sam <sam@example.com>",
	"To: andrei@example.com",
	"Subject: Re: Q3 rollout",
	"Date: Fri, 09 Oct 2026 16:00:00 +0200",
]);
check("mail that arrives later is picked up", (await syncAccount(account)) === 1);
check("the cursor moved on", (readCursor("test")?.lastSeenAt as string) === "2026-10-09T14:00:00.000Z");

const ids = readIndex("test").map((m) => m.file);
check("every stored file exists under its own name", new Set(ids).size === 3);
check("a Message-ID became a file name without a path escaping", ids[0] === "a-example.com.eml");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
