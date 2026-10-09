/**
 * The setup wizard, as logic rather than as a dialog: which questions, in what order, what is
 * verified before anything is written.
 *
 * The extension supplies the UI and calls this; the check supplies a stubbed UI and a stubbed
 * mailbox. A wizard that only exists inside a terminal dialog is a wizard nobody can test.
 */

import { spawn } from "node:child_process";
import { type AccountConfig, configPath, readConfigFile, saveAccount, saveServiceSetting } from "./config.ts";
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
}

const GMAIL = "A new Gmail for the agent";
const EXISTING = "A mailbox I already have (IMAP)";
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
			: "Mail is not configured yet. This takes about three minutes.",
		"info",
	);

	const kind =
		(await ui.select("How should the agent get mail?", [
			GMAIL,
			EXISTING,
		])) ?? undefined;
	if (!kind) {
		ui.notify("Setup cancelled.", "info");
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
		name: kind === GMAIL ? "agent" : (address.split("@")[0] ?? "agent").replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
		provider: "imap",
		host,
		user: address,
		password,
		folder: "INBOX",
	};
	saveAccount(account, path);

	const background = await ui.confirm(
		"Keep it running in the background?",
		"It will fetch mail whether or not a pi session is open. Nothing turns an agent until /email-watch is run in that session.",
	);
	if (background) {
		const state = start();
		saveServiceSetting(true, path);
		ui.notify(`The service is ${state.alive ? `running as pid ${state.pid}` : "not running — check the log"}. ${serviceStatusText()}`, state.alive ? "info" : "error");
	}

	ui.notify(
		[
			`Done. Mail sent to ${address} is now fetched into the spool as account "${account.name}".`,
			`Ask someone to cc ${address}, or forward it a message, then run /email-watch in the session that should be woken.`,
		].join("\n"),
		"info",
	);
}
