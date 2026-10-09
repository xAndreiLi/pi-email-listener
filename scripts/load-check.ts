/**
 * Layer 1: drive the extension against a stub pi API, a fixture mailbox and a real spool. No model,
 * no network, no session.
 *
 *   npm run load-check
 *
 * This proves what the extension would send and what it would block. It cannot prove that pi
 * accepts the wake — that is what the RPC test is for.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-email-listener-load-"));
const maildir = join(root, "fixtures");
mkdirSync(maildir);
process.env.PI_EMAIL_LISTENER_MAIL_DIR = join(root, "mail");
process.env.PI_EMAIL_LISTENER_CONFIG = join(root, "pi-email-listener.json");
process.env.PI_EMAIL_LISTENER_POLL_MS = "20";
writeFileSync(
	process.env.PI_EMAIL_LISTENER_CONFIG,
	JSON.stringify({ accounts: [{ name: "test", provider: "fixture", dir: maildir }], pollSeconds: 5 }),
);

const commands = new Map<string, any>();
const handlers = new Map<string, any[]>();
const sent: any[] = [];
const notices: string[] = [];

const pi = {
	registerCommand: (name: string, options: any) => commands.set(name, options),
	registerTool: () => {},
	on: (event: string, handler: any) => {
		handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		return () => {};
	},
	sendMessage: (message: any, options: any) => sent.push({ message, options }),
};
const ctx = { isIdle: () => true, ui: { notify: (message: string) => notices.push(message) } };

(await import("../src/extension.ts")).default(pi as any);
const { syncAccount } = await import("../src/fetcher.ts");
const { readIndex } = await import("../src/spool.ts");

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}
const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
async function fire(event: string) {
	for (const handler of handlers.get(event) ?? []) await handler({}, ctx);
}
const call = async (toolName: string) => (handlers.get("tool_call") ?? [])[0]?.({ toolName, input: {} }, ctx);

const account = { name: "test", provider: "fixture", dir: maildir };
function write(name: string, headers: string[], body: string) {
	writeFileSync(join(maildir, name), `${headers.join("\r\n")}\r\n\r\n${body}\r\n`);
}

// ---------------------------------------------------------------- opt-in

await fire("session_start");
await settle();
check("nothing is sent before the user asks for it", sent.length === 0);
check("the extension registers /email-watch", commands.has("email-watch"));
check("and /email-setup", commands.has("email-setup"));
check("and /email-service", commands.has("email-service"));
await commands.get("email-setup").handler("", ctx);
check(
	"setup refuses politely in a session with no dialogs rather than throwing",
	notices.some((line) => line.includes("interactive session")),
);
await commands.get("email-service").handler("status", ctx);
check("service status is reportable from a session", notices.some((line) => line.includes("mail service") || line.includes("Mail service")));

await commands.get("email-watch").handler("", ctx);
check("the command reports that it started", notices.some((line) => line.includes("Watching mail")));
check("the command warns that capture must be off", notices.some((line) => line.includes("capture")));
check("an empty spool turns nothing", sent.length === 0);

// ---------------------------------------------------------------- the wake

write(
	"a.eml",
	[
		"From: Dana Whitfield <dana@example.com>",
		"To: andrei@example.com",
		"Subject: Q3 rollout",
		"Date: Fri, 09 Oct 2026 14:32:07 +0200",
		"Message-ID: <a@example.com>",
	],
	"A short body with no links in it.",
);
check("the fetcher stores it", (await syncAccount(account)) === 1);
await settle();

check("mail turns the agent once", sent.length === 1);
const [wake] = sent;
check("the wake asks for a turn", wake.options?.triggerTurn === true);
check(
	"the pointer names the sender and the subject",
	String(wake.message.content).includes("Dana Whitfield <dana@example.com>") &&
		String(wake.message.content).includes("Q3 rollout"),
);
check("the pointer does not carry the body", !String(wake.message.content).includes("A short body"));
check("the pointer says which file to read", String(wake.message.content).includes("a-example.com.eml"));
check("the message is marked as custom, not as the user", wake.message.customType === "email" && wake.message.display === true);

await settle();
check("nothing is delivered twice", sent.length === 1);
check("the spool still holds the message once", readIndex("test").length === 1);

// ---------------------------------------------------------------- quarantine

write(
	"b.eml",
	[
		"From: Sam <sam@example.com>",
		"To: andrei@example.com",
		"Subject: Fwd: invoice",
		"Date: Fri, 09 Oct 2026 15:00:00 +0200",
		"Message-ID: <b@example.com>",
	],
	"Please review https://example.com/invoice before Friday.",
);
check("the second message is stored", (await syncAccount(account)) === 1);
await settle();
check("every message turns the agent, gate or no gate", sent.length === 2);

check("a message with a link blocks the shell", (await call("bash"))?.block === true);
check("it blocks writing too", (await call("write"))?.block === true);
check("reading is still allowed", (await call("read")) === undefined);
check("the refusal explains itself", String((await call("bash"))?.reason).includes("let the user decide"));

await fire("agent_settled");
check("the tools come back when the turn ends", (await call("bash")) === undefined);

// ---------------------------------------------------------------- stopping

await commands.get("email-watch").handler("", ctx);
check("the command stops watching", notices.some((line) => line.includes("Stopped watching")));
write(
	"c.eml",
	[
		"From: Sam <sam@example.com>",
		"To: andrei@example.com",
		"Subject: after hours",
		"Date: Fri, 09 Oct 2026 16:00:00 +0200",
		"Message-ID: <c@example.com>",
	],
	"Nobody is watching now.",
);
check("the fetcher keeps storing while nothing watches", (await syncAccount(account)) === 1);
await settle();
check("no turn starts while watching is off", sent.length === 2);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
