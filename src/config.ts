/**
 * Accounts live in a JSON file in the pi agent directory, because a mailbox belongs to the
 * machine and not to any one project. Tests move both this file and the spool with env vars.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AccountConfig {
	name: string;
	provider: string;
	/** fixture only: the directory of .eml files standing in for a mailbox. */
	dir?: string;
	/** graph only: the client id of the Entra app registration this account signs in with. */
	clientId?: string;
	/** graph only: "common" covers work and personal accounts. */
	tenant?: string;
	/** graph only: mailbox to read, default the signed-in user's. */
	mailbox?: string;
	/** graph and imap: folder to watch, default the inbox. */
	folder?: string;
	/** graph only: where a first sync starts, so a first run does not copy a whole mailbox. */
	since?: string;
	/** imap only: server and account. The password is the mailbox's own, not an app's. */
	host?: string;
	port?: number;
	user?: string;
	password?: string;
	/** imap only: the name of an environment variable holding the password, instead of storing it. */
	passwordEnv?: string;
}

export interface Config {
	accounts: AccountConfig[];
	pollSeconds: number;
	/** Whether a session should make sure the detached fetcher is running when it starts. */
	service?: { autoStart?: boolean };
}

/**
 * pi's agent directory, worked out the way pi does without importing pi: the detached fetcher runs
 * in plain node, where pi's packages are not installed. Inside pi the extension sets the config and
 * mail paths from pi itself, so this only decides for a checkout run by hand.
 */
export function agentDir(): string {
	const configured = process.env.PI_CODING_AGENT_DIR;
	if (!configured) return join(homedir(), ".pi", "agent");
	if (configured === "~") return homedir();
	const tilde = configured.startsWith("~/") || (process.platform === "win32" && configured.startsWith("~\\"));
	return tilde ? join(homedir(), configured.slice(2)) : configured;
}

export function configPath(): string {
	return process.env.PI_EMAIL_LISTENER_CONFIG ?? join(agentDir(), "pi-email-listener.json");
}

export function loadConfig(path = configPath()): Config {
	const parsed = readConfigFile(path);
	if (!existsSync(path)) {
		throw new Error(`no config at ${path} — write one with an "accounts" array (see the README)`);
	}
	if (!Array.isArray(parsed.accounts) || parsed.accounts.length === 0) {
		throw new Error(`${path} needs a non-empty "accounts" array`);
	}
	for (const account of parsed.accounts) {
		if (!account?.name || !account?.provider) {
			throw new Error(`every account in ${path} needs a "name" and a "provider"`);
		}
	}
	return { accounts: parsed.accounts, pollSeconds: parsed.pollSeconds ?? 30, service: parsed.service };
}

/** The file as written, or nothing when there is not one yet — never throws. */
export function readConfigFile(path = configPath()): Partial<Config> {
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf8")) as Partial<Config>;
	} catch (error) {
		throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
	}
}

/**
 * Add or replace one account and write the file back, leaving every other key — including accounts
 * that are already there, and settings this version does not know about — exactly as they were.
 */
export function saveAccount(account: AccountConfig, path = configPath()): Config {
	const existing = readConfigFile(path);
	const accounts = [...(existing.accounts ?? []).filter((one) => one.name !== account.name), account];
	const next: Config = {
		...existing,
		accounts,
		pollSeconds: existing.pollSeconds ?? 30,
	} as Config;
	writeFileSync(path, `${JSON.stringify(next, null, "\t")}\n`);
	return next;
}

/** Remember whether a session should keep the detached fetcher running. */
export function saveServiceSetting(autoStart: boolean, path = configPath()): void {
	const existing = readConfigFile(path);
	writeFileSync(path, `${JSON.stringify({ ...existing, service: { ...existing.service, autoStart } }, null, "\t")}\n`);
}
