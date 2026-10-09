/**
 * Accounts live in a JSON file in the pi agent directory, because a mailbox belongs to the
 * machine and not to any one project. Tests move both this file and the spool with env vars.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface AccountConfig {
	name: string;
	provider: string;
	/** fixture only: the directory of .eml files standing in for a mailbox. */
	dir?: string;
}

export interface Config {
	accounts: AccountConfig[];
	pollSeconds: number;
}

export function configPath(): string {
	return process.env.PI_EMAIL_LISTENER_CONFIG ?? join(getAgentDir(), "pi-email-listener.json");
}

export function loadConfig(path = configPath()): Config {
	if (!existsSync(path)) {
		throw new Error(`no config at ${path} — write one with an "accounts" array (see the README)`);
	}
	let parsed: Partial<Config>;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Config>;
	} catch (error) {
		throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
	}
	if (!Array.isArray(parsed.accounts) || parsed.accounts.length === 0) {
		throw new Error(`${path} needs a non-empty "accounts" array`);
	}
	for (const account of parsed.accounts) {
		if (!account?.name || !account?.provider) {
			throw new Error(`every account in ${path} needs a "name" and a "provider"`);
		}
	}
	return { accounts: parsed.accounts, pollSeconds: parsed.pollSeconds ?? 30 };
}
