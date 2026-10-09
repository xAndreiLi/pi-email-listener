/**
 * Sign in to Microsoft once for an account, so the fetcher can read that mailbox afterwards.
 *
 *   npm run mail:auth <account>
 *
 * Run this yourself. The code it prints is yours to enter, and the refresh token it stores lands in
 * the account's spool directory — not in this repository, and not in anything a session records.
 */

import { loadConfig } from "../src/config.ts";
import { readTokens, signIn } from "../src/microsoft-auth.ts";

const names = (accounts: { name: string }[]) => accounts.map((one) => one.name).join(" | ");
const accounts = loadConfig().accounts;
const wanted = process.argv[2];
const account = wanted ? accounts.find((one) => one.name === wanted) : accounts.length === 1 ? accounts[0] : undefined;

if (!account) {
	console.log(`Say which account to sign in: npm run mail:auth <${names(accounts)}>`);
	process.exitCode = 1;
} else if (account.provider !== "graph") {
	console.log(`Account "${account.name}" uses provider "${account.provider}", which needs no sign-in.`);
	process.exitCode = 1;
} else if (!account.clientId) {
	console.log(
		`Account "${account.name}" has no "clientId". Register an app in Entra (mobile and desktop application, public client) and put its client id in the account.`,
	);
	process.exitCode = 1;
} else {
	if (readTokens(account.name)) console.log(`Account "${account.name}" already has a stored sign-in; this replaces it.`);
	await signIn({ name: account.name, clientId: account.clientId, tenant: account.tenant });
	console.log(`Signed in. The refresh token is stored with the spool for "${account.name}".`);
}
