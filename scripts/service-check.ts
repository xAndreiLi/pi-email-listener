/**
 * Check for the always-on service: it really starts, it is really one process, it really stops, and
 * it writes to a log while it runs.
 *
 *   npm run service-check
 *
 * This is the one check that spawns something detached, so it starts a fixture account — no network,
 * no credentials — and always stops what it started.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-email-listener-service-"));
const fixtures = join(root, "fixtures");
mkdirSync(fixtures, { recursive: true });
mkdirSync(join(root, "mail"), { recursive: true });
writeFileSync(
	join(fixtures, "welcome.eml"),
	[
		"From: Dana Whitfield <dana@example.com>",
		"To: agent@example.com",
		"Subject: The service should store this",
		"Date: Fri, 09 Oct 2026 14:32:07 +0200",
		"Message-ID: <service@example.com>",
		"",
		"Body.",
	].join("\r\n"),
);
const configPath = join(root, "config.json");
writeFileSync(configPath, JSON.stringify({ accounts: [{ name: "svc", provider: "fixture", dir: fixtures }], pollSeconds: 5 }));

process.env.PI_EMAIL_LISTENER_MAIL_DIR = join(root, "mail");
process.env.PI_EMAIL_LISTENER_CONFIG = configPath;

const { serviceState, serviceStatusText, startService, stopService } = await import("../src/service.ts");

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

check("nothing is running to begin with", serviceState().alive === false);

const started = startService();
check("the service starts and reports a pid", typeof started.pid === "number" && started.pid > 0);
check("and it is alive", serviceState().alive === true);

const again = startService();
check("starting it twice does not start a second one", again.pid === started.pid);

// Give it a moment to do a pass and write the log.
await sleep(2_500);
const log = existsSync(started.logPath) ? readFileSync(started.logPath, "utf8") : "";
check("it is fetching, and saying so in its own log", log.includes("stored") || log.includes("nothing new"));
check("the spool it fills is the configured one", existsSync(join(root, "mail", "svc", "index.jsonl")));

const status = serviceStatusText();
check("status names the process and the log", status.includes(String(started.pid)) && status.includes("service.log"));

const stopped = stopService();
check("it stops", stopped.alive === false);
await sleep(1_000);
check("and stays stopped", serviceState().alive === false);
check("with no state file left claiming otherwise", serviceState().pid === undefined);

// If the check failed anywhere above, make sure nothing outlives it.
if (serviceState().alive) stopService();

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
