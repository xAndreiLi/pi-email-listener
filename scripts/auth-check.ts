/**
 * Offline check for the Microsoft sign-in: a stubbed identity platform, the real token store.
 *
 *   npm run auth-check
 *
 * The device code flow is a small state machine with four branches — pending, slow down, success,
 * refresh — and it is the one part of the Outlook path that cannot be exercised without somebody's
 * account. So it is exercised against a stub instead, which is how it can be trusted before a real
 * app registration is spent on it.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-email-listener-auth-"));
mkdirSync(join(root, "mail"), { recursive: true });
process.env.PI_EMAIL_LISTENER_MAIL_DIR = join(root, "mail");

const { accessTokenFor, readTokens, signIn, writeTokens } = await import("../src/microsoft-auth.ts");
const { accountDir } = await import("../src/spool.ts");

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const account = { name: "outlook", clientId: "stub-client", tenant: "common" };
const calls: { url: string; form: string }[] = [];

/** A stubbed Microsoft: the device code is issued, then two polls are pending before it succeeds. */
function identityStub(script: ("pending" | "slow_down" | "ok")[]) {
	return (async (url: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(url), form: String(init?.body ?? "") });
		if (String(url).endsWith("/devicecode")) {
			return json({
				device_code: "device-123",
				user_code: "ABCD-EFGH",
				verification_uri: "https://microsoft.com/devicelogin",
				interval: 0,
				expires_in: 900,
			});
		}
		const step = script.shift() ?? "ok";
		if (step === "pending") return json({ error: "authorization_pending" }, 400);
		if (step === "slow_down") return json({ error: "slow_down" }, 400);
		return json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
	}) as typeof fetch;
}

// ---------------------------------------------------------------- the happy path, through interrupts

const tokens = await signIn(account, { fetchImpl: identityStub(["pending", "slow_down", "ok"]), log: () => {} });

check("the sign-in survives a pending and a slow_down before succeeding", tokens.accessToken === "access-1");
check(
	"the device code was requested with the client id and the two scopes",
	calls[0]?.url.endsWith("/common/oauth2/v2.0/devicecode") === true &&
		calls[0]?.form.includes("client_id=stub-client") === true &&
		// URLSearchParams writes a space as "+", which decodeURIComponent leaves alone.
		(calls[0]?.form ?? "").replace(/\+/g, " ").includes("offline_access Mail.Read"),
);
check("every poll asked for the device code grant", calls.slice(1, 4).every((call) => call.form.includes("device_code")));
check("the refresh token was kept", readTokens("outlook")?.refreshToken === "refresh-1");
check("so was the expiry", (readTokens("outlook")?.expiresAt ?? 0) > Date.now());
check(
	"the token store sits with the spool, not in the repository",
	existsSync(join(accountDir("outlook"), "token.json")) && !existsSync(join(process.cwd(), "token.json")),
);

// ---------------------------------------------------------------- reuse, then refresh

const beforeReuse = calls.length;
check("a fresh token is used without asking again", (await accessTokenFor("outlook", identityStub([]))) === "access-1");
check("and no request was made for it", calls.length === beforeReuse);

writeTokens("outlook", { ...(readTokens("outlook") as never), accessToken: "stale", expiresAt: Date.now() + 10_000 });
const refreshStub = identityStub(["ok"]);
const refreshed = await accessTokenFor("outlook", refreshStub);
check("an expiring token is refreshed before it is used", refreshed === "access-1");
check("the refresh asked with the refresh token", calls.at(-1)?.form.includes("refresh_token") === true);
check("and the refreshed token was stored", readTokens("outlook")?.accessToken === "access-1");

// ---------------------------------------------------------------- rotating refresh tokens

writeTokens("outlook", { ...(readTokens("outlook") as never), accessToken: "stale", expiresAt: 0, refreshToken: "refresh-1" });
await accessTokenFor(
	"outlook",
	(async () => json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 })) as typeof fetch,
);
check("a rotated refresh token replaces the old one", readTokens("outlook")?.refreshToken === "refresh-2");

// ---------------------------------------------------------------- the two failures worth naming

writeFileSync(join(accountDir("outlook"), "token.json"), "not json at all");
check("an unreadable token store reads as no sign-in", readTokens("outlook") === undefined);

let message = "";
try {
	await accessTokenFor("outlook");
} catch (error) {
	message = (error as Error).message;
}
check("and the error says exactly what to run", message.includes("npm run mail:auth outlook"));

let noRefresh = "";
try {
	await signIn(account, {
		fetchImpl: (async () => json({ access_token: "access-1", expires_in: 3600 })) as typeof fetch,
		log: () => {},
	});
} catch (error) {
	noRefresh = (error as Error).message;
}
check("a sign-in with no refresh token is refused, loudly", noRefresh.includes("no refresh token"));

// A corrupted store is recoverable by signing in again, which is what the person would do.
await signIn(account, { fetchImpl: identityStub(["ok"]), log: () => {} });
check(
	"signing in again repairs a corrupted token store",
	(JSON.parse(readFileSync(join(accountDir("outlook"), "token.json"), "utf8")) as { refreshToken?: string }).refreshToken ===
		"refresh-1",
);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
