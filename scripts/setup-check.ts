/**
 * Offline check for the setup wizard: a stubbed conversation, a stubbed mailbox, a real config file.
 *
 *   npm run setup-check
 *
 * A wizard is the kind of thing that breaks silently — it is only ever exercised by a person, once.
 * So the questions, the order, and what is written are all asserted here instead.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-email-listener-setup-"));

const { runSetup } = await import("../src/setup.ts");

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
	const opened: string[] = [];
	const inputs = [...(script.inputs ?? [])];
	const confirms = [...(script.confirms ?? [])];
	return {
		notices,
		asked,
		opened,
		ui: {
			notify: (message: string) => void notices.push(message),
			select: async (title: string) => {
				asked.push(`select:${title}`);
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

const GMAIL = "A new Gmail for the agent (recommended)";
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

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
