/**
 * The setup wizard, as logic rather than as a dialog: which questions, in what order, what is
 * verified before anything is written.
 *
 * The extension supplies the UI and calls this; the check supplies a stubbed UI and a stubbed
 * mailbox. A wizard that only exists inside a terminal dialog is a wizard nobody can test.
 */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { type AccountConfig, type Config, configPath, readConfigFile, saveAccount, saveServiceSetting } from "./config.ts";
import { verifyImap } from "./imap.ts";
import { startService, serviceStatusText } from "./service.ts";

export interface SetupUi {
	notify(message: string, level?: string): void;
	confirm(title: string, message: string): Promise<boolean>;
	input(title: string, placeholder?: string): Promise<string | undefined>;
	select(title: string, options: string[]): Promise<string | undefined>;
}

export interface SetupOptions {
	/** Movable so the check does not touch the real config. */
	path?: string;
	/** Injected so setup can be verified without a mailbox. */
	verify?: typeof verifyImap;
	/** Injected so the check does not open a browser or spawn anything. */
	open?: (url: string) => void;
	start?: typeof startService;
	/** Injected so the check can create an address without creating one at AgentMail. */
	signUp?: typeof signUpAgentMail;
}

const AGENTMAIL = "Give the agent its own address (instant, no sign-up)";
const GMAIL = "A new Gmail for the agent";
const EXISTING = "A mailbox I already have (IMAP)";
const AGENTMAIL_IMAP = "imap.agentmail.to";
const AGENTMAIL_CLAIM = "https://console.agentmail.to/claim";

export interface AgentMailInbox {
	inboxId: string;
	/** The only copy there will ever be: AgentMail cannot recover it. */
	apiKey: string;
}

/**
 * Create an AgentMail inbox for the agent, with no human attached — which makes it receive-only:
 * AgentMail itself refuses to send from it. A refused name comes back as AgentMail's own words.
 */
export async function signUpAgentMail(username: string, fetchImpl: typeof fetch = fetch): Promise<AgentMailInbox> {
	const response = await fetchImpl("https://api.agentmail.to/v0/agent/sign-up", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username, source: "pi-email-listener" }),
	});
	const body = (await response.json().catch(() => ({}))) as {
		inbox_id?: string;
		api_key?: string;
		message?: string;
		fix?: string;
		errors?: { message?: string }[];
	};
	if (!response.ok || !body.inbox_id || !body.api_key) {
		const said = [body.message ?? body.errors?.[0]?.message, body.fix].filter(Boolean).join(" — ");
		throw new Error(said || `AgentMail answered ${response.status}`);
	}
	return { inboxId: body.inbox_id, apiKey: body.api_key };
}

/** The part of an address before the @, made safe to use as a directory name. */
function accountName(address: string): string {
	return (address.split("@")[0] ?? "agent").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}
const SIGNUP = "https://accounts.google.com/signup";
const APP_PASSWORDS = "https://myaccount.google.com/apppasswords";

/** Best effort: if it cannot open, the URLs are printed anyway. */
export function openInBrowser(url: string): void {
	const [command, args] =
		process.platform === "win32"
			? ["cmd", ["/c", "start", "", url]]
			: process.platform === "darwin"
				? ["open", [url]]
				: ["xdg-open", [url]];
	const child = spawn(command, args as string[], { detached: true, stdio: "ignore", windowsHide: true });
	// A machine with no browser is not a failure; the URL is in the transcript either way.
	child.on("error", () => {});
	child.unref();
}

export async function runSetup(ui: SetupUi, options: SetupOptions = {}): Promise<void> {
	const path = options.path ?? configPath();
	const verify = options.verify ?? verifyImap;
	const open = options.open ?? openInBrowser;
	const start = options.start ?? startService;

	const already = readConfigFile(path);
	ui.notify(
		already.accounts?.length
			? `Mail is configured for: ${already.accounts.map((one) => one.name).join(", ")}. ${serviceStatusText()}`
			: "Mail is not configured yet. A new address for the agent takes a minute; a mailbox of your own, a few.",
		"info",
	);

	const kind =
		(await ui.select("How should the agent get mail?", [
			AGENTMAIL,
			GMAIL,
			EXISTING,
		])) ?? undefined;
	if (!kind) {
		ui.notify("Setup cancelled.", "info");
		return;
	}
	if (kind === AGENTMAIL) {
		await giveItAnAddress(ui, already, path, options.signUp ?? signUpAgentMail, verify, start);
		return;
	}

	if (kind === GMAIL) {
		ui.notify(
			[
				"The agent needs a mailbox of its own — it reads that, not yours. Two things to do:",
				`  1. Create the account: ${SIGNUP}`,
				`  2. Turn on 2-Step Verification, then make an app password: ${APP_PASSWORDS}`,
				"Gmail only allows app passwords when 2-Step Verification is on, and those 16 characters are what this uses.",
				"If Google will not offer an app password at all, this mailbox cannot be read: pick the other option and use any host that sells IMAP — nothing here depends on Gmail.",
			].join("\n"),
			"info",
		);
		if (await ui.confirm("Open those two pages now?", "")) {
			open(SIGNUP);
			open(APP_PASSWORDS);
		}
	}

	const address = (await ui.input("The agent's email address", "your.agent@gmail.com"))?.trim();
	if (!address) {
		ui.notify("Setup cancelled — no address given.", "info");
		return;
	}

	let host = kind === GMAIL ? "imap.gmail.com" : ((await ui.input("IMAP server", `imap.${address.split("@")[1] ?? "example.com"}`))?.trim() ?? "");
	if (!host) {
		host = `imap.${address.split("@")[1] ?? "example.com"}`;
	}

	ui.notify("The app password is typed into this terminal, so it is visible on screen here — it is not written anywhere else.", "warning");
	const password = (await ui.input("The app password for that mailbox", "16 characters, no spaces"))?.trim();
	if (!password) {
		ui.notify("Setup cancelled — no password given.", "info");
		return;
	}

	ui.notify(`Checking ${address} on ${host}…`, "info");
	let messages: number;
	try {
		({ messages } = await verify({ host, user: address, password }));
	} catch (error) {
		ui.notify(
			[
				`That did not work: ${(error as Error).message}`,
				"",
				"The usual causes, in the order worth checking:",
				"  1. 2-Step Verification is off, so no app password can exist.",
				"  2. The ordinary account password was used instead of an app password.",
				"  3. The only second step is a passkey or a security key, which Gmail does not accept for app passwords.",
				"  4. Google has simply decided not to offer app passwords for this account — the page says 'the setting you are looking for is not available for your account'. Nothing here can be done about that from this side; the way out is a mailbox from a host that sells IMAP, which the other option takes.",
			].join("\n"),
			"error",
		);
		return;
	}
	ui.notify(`Signed in — ${messages} message(s) in the inbox. Writing the config.`, "info");

	const account: AccountConfig = {
		name: kind === GMAIL ? "agent" : accountName(address),
		provider: "imap",
		host,
		user: address,
		password,
		folder: "INBOX",
	};
	saveAccount(account, path);

	await offerService(ui, start, path);

	ui.notify(
		[
			`Done. Mail sent to ${address} is now fetched into the spool as account "${account.name}".`,
			`Ask someone to cc ${address}, or forward it a message, then run /email-watch in the session that should be woken.`,
		].join("\n"),
		"info",
	);
}

async function offerService(ui: SetupUi, start: typeof startService, path: string): Promise<void> {
	const background = await ui.confirm(
		"Keep it running in the background?",
		"It will fetch mail whether or not a pi session is open. Nothing turns an agent until /email-watch is run in that session.",
	);
	if (!background) return;
	const state = start();
	saveServiceSetting(true, path);
	ui.notify(`The service is ${state.alive ? `running as pid ${state.pid}` : "not running — check the log"}. ${serviceStatusText()}`, state.alive ? "info" : "error");
}

/**
 * The one-step route: AgentMail creates the agent's address on the spot. Unlike the other routes it
 * writes before it verifies, because the key it hands back cannot be fetched again — a check that
 * failed first would lose the inbox.
 */
async function giveItAnAddress(
	ui: SetupUi,
	already: Partial<Config>,
	path: string,
	signUp: typeof signUpAgentMail,
	verify: typeof verifyImap,
	start: typeof startService,
): Promise<void> {
	const existing = already.accounts?.find((one) => one.host === AGENTMAIL_IMAP && (one.folder ?? "INBOX") === "INBOX");
	if (existing && !(await ui.confirm(`This machine already has an address: ${existing.user}`, "Creating another makes a second, separate inbox. Continue?"))) {
		ui.notify("Setup cancelled.", "info");
		return;
	}
	ui.notify(
		[
			"AgentMail will create an address for the agent — no sign-up, no card, no password to make.",
			"It can receive mail but never send it: AgentMail itself refuses, and this package has no send path either.",
			"Its key is written to your config and nowhere else, and AgentMail cannot recover it.",
		].join("\n"),
		"info",
	);

	let inbox: AgentMailInbox | undefined;
	while (!inbox) {
		const username = (await ui.input("A name for the agent's address", "e.g. pm-assistant → pm-assistant@agentmail.to"))?.trim();
		if (!username) {
			ui.notify("Setup cancelled — no name given.", "info");
			return;
		}
		try {
			inbox = await signUp(username);
		} catch (error) {
			ui.notify(`AgentMail would not create "${username}": ${(error as Error).message}. Try another name, or cancel.`, "error");
		}
	}

	const name = accountName(inbox.inboxId);
	const account: AccountConfig = { name, provider: "imap", host: AGENTMAIL_IMAP, user: inbox.inboxId, password: inbox.apiKey, folder: "INBOX" };
	// Spam is a folder of its own at AgentMail; watching it keeps a false positive in the agent's sight.
	const spam: AccountConfig = { ...account, name: `${name}-spam`, folder: "Spam" };
	try {
		saveAccount(account, path);
		saveAccount(spam, path);
	} catch (error) {
		// The config is the only place the key would live, so a config that cannot be written must not lose it.
		const rescue = `${path}.${name}.agentmail.json`;
		writeFileSync(rescue, `${JSON.stringify({ inbox_id: inbox.inboxId, api_key: inbox.apiKey }, null, "\t")}\n`, { mode: 0o600 });
		ui.notify(
			`Created ${inbox.inboxId}, but the config could not be written (${(error as Error).message}). Its key is in ${rescue} instead — keep that file, because AgentMail cannot recover the key.`,
			"error",
		);
		return;
	}

	ui.notify(`Created ${inbox.inboxId}. Checking the login…`, "info");
	try {
		await verify({ host: AGENTMAIL_IMAP, user: inbox.inboxId, password: inbox.apiKey });
		await verify({ host: AGENTMAIL_IMAP, user: inbox.inboxId, password: inbox.apiKey, mailbox: "Spam" });
		ui.notify("Signed in — the inbox and its Spam folder both answer.", "info");
	} catch (error) {
		// Already written on purpose; the fetcher retries on every pass.
		ui.notify(`Saved, but the first login check failed: ${(error as Error).message}. The fetcher tries again on every pass; /email-service shows the last thing it said.`, "warning");
	}

	await offerService(ui, start, path);

	ui.notify(
		[
			`Done. The agent's address is ${inbox.inboxId}, fetched as "${name}" and "${name}-spam".`,
			`Its key is the password in ${path} — to make it recoverable, claim the inbox at ${AGENTMAIL_CLAIM}. That also lets it send, so only if you want that.`,
			`Ask someone to cc ${inbox.inboxId}, or forward it a message, then run /email-watch in the session that should be woken.`,
		].join("\n"),
		"info",
	);
}
