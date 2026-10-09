/**
 * Microsoft sign-in for the Graph source: the device code flow, and a refresh token kept beside
 * the spool.
 *
 * There is no client secret. This is a public client doing the flow Microsoft documents for apps
 * that cannot receive a browser redirect: the user is shown a code, signs in wherever they like,
 * and this process polls for the result. The refresh token stays in the account's spool directory —
 * never in the repository, and never in a transcript.
 *
 * `fetchImpl` is injectable so the whole state machine — pending, slow down, success, refresh — can
 * be driven against a stub. `npm run auth-check` does that; nothing else may.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { accountDir } from "./spool.ts";

const AUTHORITY = "https://login.microsoftonline.com";
/** offline_access is what buys a refresh token; Mail.Read is the smallest scope that reads mail. */
const SCOPE = "offline_access Mail.Read";

export interface StoredTokens {
	clientId: string;
	tenant: string;
	refreshToken: string;
	accessToken?: string;
	/** Epoch milliseconds. */
	expiresAt?: number;
}

export interface AuthOptions {
	fetchImpl?: typeof fetch;
	log?: (line: string) => void;
}

function tokenFile(account: string): string {
	return join(accountDir(account), "token.json");
}

export function readTokens(account: string): StoredTokens | undefined {
	const file = tokenFile(account);
	if (!existsSync(file)) return undefined;
	try {
		return JSON.parse(readFileSync(file, "utf8")) as StoredTokens;
	} catch {
		// An unreadable token store means signing in again, which is recoverable and loud.
		return undefined;
	}
}

export function writeTokens(account: string, tokens: StoredTokens): void {
	// Windows ignores the mode; the protection is that this lives in the agent directory and not in
	// anything that is committed or synced.
	writeFileSync(tokenFile(account), JSON.stringify(tokens, null, "\t"), { mode: 0o600 });
}

async function post(
	url: string,
	form: Record<string, string>,
	doFetch: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
	const response = await doFetch(url, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(form).toString(),
	});
	const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
	if (!response.ok) {
		const error = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
		const description = typeof body.error_description === "string" ? `: ${body.error_description.split("\n")[0]}` : "";
		throw new Error(`${error}${description}`);
	}
	return body;
}

/**
 * Walks the user through signing in and returns the tokens. Prints the code rather than returning
 * it, because the person running this is the only one who should see it.
 */
export async function signIn(
	account: { name: string; clientId: string; tenant?: string },
	options: AuthOptions = {},
): Promise<StoredTokens> {
	const { fetchImpl = fetch, log = console.log } = options;
	const tenant = account.tenant ?? "common";
	const started = (await post(
		`${AUTHORITY}/${tenant}/oauth2/v2.0/devicecode`,
		{ client_id: account.clientId, scope: SCOPE },
		fetchImpl,
	)) as { user_code: string; verification_uri: string; device_code: string; interval?: number; expires_in: number };

	log(`\nTo sign in: open ${started.verification_uri} and enter the code ${started.user_code}\n`);
	log(`Waiting for the sign-in to be completed (up to ${Math.round(started.expires_in / 60)} minutes)…`);

	let interval = (started.interval ?? 5) * 1000;
	const deadline = Date.now() + started.expires_in * 1000;
	for (;;) {
		await new Promise((resolve) => setTimeout(resolve, interval));
		if (Date.now() > deadline) throw new Error("the sign-in code expired before it was used — run this again");
		let result: Record<string, unknown>;
		try {
			result = await post(
				`${AUTHORITY}/${tenant}/oauth2/v2.0/token`,
				{
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					client_id: account.clientId,
					device_code: started.device_code,
				},
				fetchImpl,
			);
		} catch (error) {
			const message = (error as Error).message;
			if (message.startsWith("authorization_pending")) continue;
			if (message.startsWith("slow_down")) {
				interval += 5_000;
				continue;
			}
			throw error;
		}
		const tokens: StoredTokens = {
			clientId: account.clientId,
			tenant,
			refreshToken: String(result.refresh_token ?? ""),
			accessToken: String(result.access_token ?? ""),
			expiresAt: Date.now() + Number(result.expires_in ?? 0) * 1000,
		};
		if (!tokens.refreshToken) {
			throw new Error("Microsoft returned no refresh token — check that the app registration allows public clients");
		}
		writeTokens(account.name, tokens);
		return tokens;
	}
}

/** A usable access token, refreshed when it is close to expiring. */
export async function accessTokenFor(account: string, fetchImpl: typeof fetch = fetch): Promise<string> {
	const tokens = readTokens(account);
	if (!tokens) throw new Error(`no stored sign-in for account "${account}" — run: npm run mail:auth ${account}`);
	if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;

	const refreshed = (await post(
		`${AUTHORITY}/${tokens.tenant}/oauth2/v2.0/token`,
		{
			grant_type: "refresh_token",
			client_id: tokens.clientId,
			refresh_token: tokens.refreshToken,
			scope: SCOPE,
		},
		fetchImpl,
	)) as { access_token: string; expires_in: number; refresh_token?: string };

	const next: StoredTokens = {
		...tokens,
		// Microsoft may rotate the refresh token; keep the new one when it does.
		refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
		accessToken: refreshed.access_token,
		expiresAt: Date.now() + Number(refreshed.expires_in ?? 0) * 1000,
	};
	writeTokens(account, next);
	return next.accessToken as string;
}
