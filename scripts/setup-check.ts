/**
 * Offline check for the setup wizard: a stubbed conversation, a stubbed mailbox, a real config file.
 *
 *   npm run setup-check
 *
 * A wizard is the kind of thing that breaks silently — it is only ever exercised by a person, once.
 * So the questions, the order, and what is written are all asserted here instead.
 */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-email-listener-setup-"));

const { runSetup, signUpAgentMail } = await import("../src/setup.ts");

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}

interface Script {
	select?: string;
	inputs?: (string | undefined)[];
	confirms?: boolean[];
}

function stubUi(script: Script) {
	const notices: string[] = [];
	const asked: string[] = [];
	const offered: string[] = [];
	const opened: string[] = [];
	const inputs = [...(script.inputs ?? [])];
	const confirms = [...(script.confirms ?? [])];
	return {
		notices,
		asked,
		offered,
		opened,
		ui: {
			notify: (message: string) => void notices.push(message),
			select: async (title: string, options: string[]) => {
				asked.push(`select:${title}`);
				offered.push(...options);
				return script.select;
			},
			input: async (title: string) => {
				asked.push(`input:${title}`);
				return inputs.shift();
			},
			confirm: async (title: string) => {
				asked.push(`confirm:${title}`);
				return confirms.shift() ?? false;
			},
		},
	};
}

const GMAIL = "A new Gmail for the agent";
const dir = join(root, "one");
mkdirSync(dir, { recursive: true });
const path = join(dir, "pi-email-listener.json");

// ---------------------------------------------------------------- the happy path

const happy = stubUi({
	select: GMAIL,
	inputs: ["agent@gmail.com", "abcd efgh ijkl mnop"],
	confirms: [true, true],
});
let verified: Record<string, unknown> | undefined;
let started = 0;
await runSetup(happy.ui, {
	path,
	open: (url) => happy.opened.push(url),
	verify: async (options: Record<string, unknown>) => {
		verified = options;
		return { messages: 3 };
	},
	start: () => {
		started++;
		return { pid: 4321, alive: true, logPath: "log" };
	},
});

check("it asks what kind of mailbox before anything else", happy.asked[0]?.startsWith("select:") === true);
check("a Gmail setup offers the signup and app-password pages", happy.opened.some((url) => url.includes("signup")) && happy.opened.some((url) => url.includes("apppasswords")));
check("it verifies the login before writing anything", verified?.host === "imap.gmail.com" && verified?.user === "agent@gmail.com");
check("it starts the service when asked", started === 1);

const written = JSON.parse(readFileSync(path, "utf8")) as { accounts: { name: string; provider: string; password: string }[]; service?: { autoStart?: boolean } };
check("the account is written with the provider that needs no registration", written.accounts[0]?.provider === "imap" && written.accounts[0]?.name === "agent");
check("the app password is stored so the service can use it", written.accounts[0]?.password === "abcd efgh ijkl mnop");
check("and the service is remembered as always on", written.service?.autoStart === true);
check("the last thing it says is what to cc", happy.notices.at(-1)?.includes("agent@gmail.com") === true);

// ---------------------------------------------------------------- a bad password writes nothing

const badPath = join(root, "bad.json");
const bad = stubUi({ select: GMAIL, inputs: ["agent@gmail.com", "wrong"], confirms: [false] });
await runSetup(bad.ui, {
	path: badPath,
	open: () => {},
	verify: async () => {
		throw new Error("Invalid credentials");
	},
	start: () => ({ pid: 1, alive: true, logPath: "log" }),
});
check("a failed login writes no config at all", !existsSync(badPath));
check("and the person is told what usually causes it", bad.notices.some((line) => line.includes("2-Step Verification")));

// ---------------------------------------------------------------- cancelling writes nothing

const cancelPath = join(root, "cancel.json");
const cancel = stubUi({ select: GMAIL, inputs: [undefined], confirms: [false] });
await runSetup(cancel.ui, { path: cancelPath, open: () => {}, verify: async () => ({ messages: 0 }) });
check("cancelling at the address writes nothing", !existsSync(cancelPath));

// ---------------------------------------------------------------- an existing config survives

const mergePath = join(root, "merge.json");
writeFileSync(
	mergePath,
	JSON.stringify({
		accounts: [{ name: "work", provider: "graph", clientId: "abc" }],
		pollSeconds: 45,
		somethingNewer: { keep: true },
	}),
);
const merge = stubUi({ select: GMAIL, inputs: ["agent@gmail.com", "pw"], confirms: [false, false] });
await runSetup(merge.ui, { path: mergePath, open: () => {}, verify: async () => ({ messages: 0 }) });
const merged = JSON.parse(readFileSync(mergePath, "utf8")) as { accounts: { name: string }[]; pollSeconds: number; somethingNewer?: unknown; service?: unknown };
check("another account is left alone", merged.accounts.some((one) => one.name === "work"));
check("the new one is added", merged.accounts.some((one) => one.name === "agent"));
check("settings this version does not know about survive", merged.somethingNewer !== undefined);
check("so does the poll interval", merged.pollSeconds === 45);
check("and no service setting is invented when it was declined", merged.service === undefined);

// ---------------------------------------------------------------- a mailbox somebody already has

const ownPath = join(root, "own.json");
const own = stubUi({
	select: "A mailbox I already have (IMAP)",
	inputs: ["dana@fastmail.com", "imap.fastmail.com", "pw"],
	confirms: [false, false],
});
let ownHost: unknown;
await runSetup(own.ui, {
	path: ownPath,
	open: () => {},
	verify: async (options: Record<string, unknown>) => {
		ownHost = options.host;
		return { messages: 1 };
	},
});
check("an existing mailbox is asked for its server", ownHost === "imap.fastmail.com");
const ownWritten = JSON.parse(readFileSync(ownPath, "utf8")) as { accounts: { name: string; host: string }[] };
check("and is stored under a name taken from the address", ownWritten.accounts[0]?.name === "dana" && ownWritten.accounts[0]?.host === "imap.fastmail.com");

// ---------------------------------------------------------------- an address made on the spot

const AGENTMAIL = "Give the agent its own address (instant, no sign-up)";
const KEY = "am_us_stub-key-that-must-never-be-shown";
const made = (username: string) => ({ inboxId: `${username}@agentmail.to`, apiKey: KEY });
type Written = { accounts: { name: string; provider: string; host?: string; user?: string; password?: string; folder?: string }[] };
const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Written;

const amPath = join(root, "agentmail.json");
const am = stubUi({ select: AGENTMAIL, inputs: ["taken", "pm-assistant"], confirms: [false] });
const tried: string[] = [];
const checked: { mailbox?: unknown; writtenFirst: boolean }[] = [];
await runSetup(am.ui, {
	path: amPath,
	open: () => {},
	start: () => ({ pid: 1, alive: true, logPath: "log" }),
	signUp: async (username: string) => {
		tried.push(username);
		if (username === "taken") throw new Error("Username is already taken");
		return made(username);
	},
	verify: async (options: Record<string, unknown>) => {
		checked.push({ mailbox: options.mailbox, writtenFirst: existsSync(amPath) });
		return { messages: 0 };
	},
});
const amAccounts = read(amPath).accounts;
const inbox = amAccounts.find((one) => one.name === "pm-assistant");
check("the new address is the first thing offered", am.asked[0]?.startsWith("select:") === true && am.offered[0] === AGENTMAIL);
check("a refused name is reported in AgentMail's words, and another is asked for", tried.join(",") === "taken,pm-assistant" && am.notices.some((line) => line.includes("Username is already taken")));
check("the address is read over IMAP like any other mailbox", inbox?.provider === "imap" && inbox.host === "imap.agentmail.to" && inbox.user === "pm-assistant@agentmail.to" && inbox.folder === "INBOX");
check("its Spam folder is watched as well", amAccounts.some((one) => one.name === "pm-assistant-spam" && one.folder === "Spam"));
check("the key is stored as the password of both", amAccounts.length === 2 && amAccounts.every((one) => one.password === KEY));
check("both folders are checked, and only once the key is safely written", checked.length === 2 && checked[1]?.mailbox === "Spam" && checked.every((one) => one.writtenFirst));
check("the key never appears in anything said on screen", am.notices.every((line) => !line.includes(KEY)));
check("the last thing it says is the address to cc", am.notices.at(-1)?.includes("pm-assistant@agentmail.to") === true);

const keptPath = join(root, "kept.json");
const kept = stubUi({ select: AGENTMAIL, inputs: ["fresh"], confirms: [false] });
await runSetup(kept.ui, {
	path: keptPath,
	open: () => {},
	signUp: async (username: string) => made(username),
	verify: async () => {
		throw new Error("connection reset");
	},
});
check("a failed first login keeps the account, because the key cannot be fetched again", read(keptPath).accounts.length === 2 && kept.notices.some((line) => line.includes("connection reset")));

const twicePath = join(root, "twice.json");
writeFileSync(twicePath, JSON.stringify({ accounts: [{ name: "suruiling", provider: "imap", host: "imap.agentmail.to", user: "suruiling@agentmail.to", password: "x", folder: "INBOX" }], pollSeconds: 30 }));
let twiceSignUps = 0;
const twice = stubUi({ select: AGENTMAIL, inputs: ["another"], confirms: [false] });
await runSetup(twice.ui, {
	path: twicePath,
	open: () => {},
	signUp: async (username: string) => {
		twiceSignUps++;
		return made(username);
	},
	verify: async () => ({ messages: 0 }),
});
check("an address that already exists is named before a second one is made", twice.asked.some((question) => question.startsWith("confirm:") && question.includes("suruiling@agentmail.to")));
check("and declining makes nothing", twiceSignUps === 0 && read(twicePath).accounts.length === 1);

const lockedDir = join(root, "locked");
mkdirSync(lockedDir);
const lockedPath = join(lockedDir, "pi-email-listener.json");
writeFileSync(lockedPath, JSON.stringify({ accounts: [], pollSeconds: 30 }));
chmodSync(lockedPath, 0o444);
const locked = stubUi({ select: AGENTMAIL, inputs: ["rescued"], confirms: [false] });
await runSetup(locked.ui, { path: lockedPath, open: () => {}, signUp: async (username: string) => made(username), verify: async () => ({ messages: 0 }) });
chmodSync(lockedPath, 0o644);
const rescue = `${lockedPath}.rescued.agentmail.json`;
check("a config that cannot be written does not lose the key", existsSync(rescue) && readFileSync(rescue, "utf8").includes(KEY));
check("it says where the key went, without showing it", locked.notices.some((line) => line.includes(rescue)) && locked.notices.every((line) => !line.includes(KEY)));

// The sign-up call itself, against AgentMail's documented response and error shapes.
let sent: { url?: string; body?: Record<string, unknown> } = {};
const answers = async (status: number, body: unknown) =>
	(async (url: string | URL | Request, init?: RequestInit) => {
		sent = { url: String(url), body: JSON.parse(String(init?.body)) };
		return new Response(JSON.stringify(body), { status });
	}) as typeof fetch;
const signed = await signUpAgentMail("pm-assistant", await answers(200, { organization_id: "o", inbox_id: "pm-assistant@agentmail.to", api_key: KEY }));
check("the sign-up sends the name and no human email, so the inbox is receive-only", sent.url === "https://api.agentmail.to/v0/agent/sign-up" && sent.body?.username === "pm-assistant" && !("human_email" in (sent.body ?? {})) && signed.apiKey === KEY);
const refusal = await signUpAgentMail("x", await answers(400, { name: "ValidationError", errors: [{ path: ["username"], message: "Username is already taken" }], fix: "Choose another username" })).catch((error: Error) => error.message);
check("a refusal comes back in AgentMail's own words", refusal === "Username is already taken — Choose another username");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
