/**
 * Layer 2: a real pi, driven over RPC, woken by a real message reaching the spool.
 *
 *   node scripts/live-test.mjs
 *
 *   node scripts/live-test.mjs              the extension loaded explicitly with -e
 *   node scripts/live-test.mjs --installed  the installed package, loaded by pi itself
 *
 * Layer 1 proves what the extension would send. Only this proves pi accepts it: print mode exits
 * when the prompt settles, so anything that happens while the agent is idle — which is the whole
 * feature — can only be seen by keeping the process alive. Watch for an `agent_start` with no
 * prompt behind it.
 *
 * This spawns a pi session and costs one small model call per run.
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-email-listener-live-"));
const maildir = join(root, "fixtures");
mkdirSync(maildir);
const config = join(root, "pi-email-listener.json");
writeFileSync(config, JSON.stringify({ accounts: [{ name: "test", provider: "fixture", dir: maildir }], pollSeconds: 5 }));

const env = {
	...process.env,
	PI_EMAIL_LISTENER_MAIL_DIR: join(root, "mail"),
	PI_EMAIL_LISTENER_CONFIG: config,
	PI_EMAIL_LISTENER_POLL_MS: "500",
	PI_EMAIL_LISTENER_AUTOSTART: "1",
};

const installed = process.argv.includes("--installed");
const piEntry = "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js";
// Without -e, the extension has to come from the installed package — which is a different claim
// from "the code works": it is the claim that pi runs what was installed.
const args = [piEntry, "--mode", "rpc", "--no-session", ...(installed ? [] : ["-e", "./src/extension.ts"])];
const pi = spawn(process.execPath, args, {
	env,
	stdio: ["pipe", "pipe", "inherit"],
});

const timeline = [];
const start = Date.now();
const mark = (what) => timeline.push(`${((Date.now() - start) / 1000).toFixed(1)}s ${what}`);

/** JSONL, split on LF only: U+2028 and U+2029 are legal inside JSON strings. */
let buffer = "";
const records = [];
pi.stdout.setEncoding("utf8");
pi.stdout.on("data", (chunk) => {
	buffer += chunk;
	let newline = buffer.indexOf("\n");
	while (newline >= 0) {
		const line = buffer.slice(0, newline).replace(/\r$/, "");
		buffer = buffer.slice(newline + 1);
		newline = buffer.indexOf("\n");
		if (line.trim()) {
			try {
				onRecord(JSON.parse(line));
			} catch {
				mark(`unparsable record: ${line.slice(0, 80)}`);
			}
		}
	}
});

let settles = 0;
let wakeText = "";
let woke = false;
let settledWithoutWake;

function onRecord(record) {
	records.push(record);

	// The pointer can arrive on more than one record type (`message_start`, `message_end`, and a
	// custom message is not an assistant message), so look for the text itself rather than for a
	// record name. Nothing else in this run contains "[email]".
	if (JSON.stringify(record).includes("[email]")) {
		const pointer = JSON.stringify(record).match(/\[email\][^"\\]*/)?.[0];
		if (pointer) {
			wakeText = pointer;
			mark(`wake message: ${pointer}`);
		}
	}

	switch (record.type) {
		case "agent_settled":
			settles++;
			mark(`agent_settled #${settles}`);
			if (settles === 1) settledWithoutWake = true;
			break;
		case "agent_start":
			mark(`agent_start${settledWithoutWake && settles > 0 ? " (no prompt behind it — this is the wake)" : ""}`);
			if (settledWithoutWake) woke = true;
			break;
		default:
			break;
	}
}

function send(command) {
	pi.stdin.write(`${JSON.stringify(command)}\n`);
}

function close(reason) {
	mark(reason);
	pi.stdin.end();
	setTimeout(() => {
		pi.kill();
		console.log(timeline.join("\n"));
		console.log(`\n${records.length} protocol records`);
		if (woke && wakeText) {
			console.log(
				`PASS: a spooled message started a turn by itself, carrying the pointer${installed ? " (extension loaded from the installed package)" : ""}`,
			);
		} else {
			// Say what did happen, so a failure is diagnosable without another run.
			const types = new Map();
			for (const record of records) types.set(record.type, (types.get(record.type) ?? 0) + 1);
			console.log(`FAIL: woke=${woke} pointer=${Boolean(wakeText)}`);
			console.log(`record types: ${[...types].map(([type, count]) => `${type}×${count}`).join(", ")}`);
			const custom = records.filter((record) => JSON.stringify(record).includes("custom"));
			console.log(`records mentioning a custom message: ${custom.length}`);
			for (const record of custom.slice(0, 3)) console.log(JSON.stringify(record).slice(0, 400));
		}
		process.exitCode = woke && wakeText ? 0 : 1;
	}, 1_500);
}

// Subscribe before prompting: a fast run finishes before anything is listening.
setTimeout(() => send({ id: "p1", type: "prompt", message: "Reply with the single word READY and stop." }), 2_000);

// The prompt settles first, then mail arrives. Anything after this point is the feature.
setTimeout(() => {
	writeFileSync(
		join(maildir, "wake.eml"),
		[
			"From: Dana Whitfield <dana@example.com>",
			"To: andrei@example.com",
			"Subject: Q3 rollout needs a decision",
			"Date: Fri, 09 Oct 2026 14:32:07 +0200",
			"Message-ID: <live@example.com>",
			"",
			"No links and no attachments here.",
		].join("\r\n"),
	);
	const stored = spawn(process.execPath, ["node_modules/jiti/lib/jiti-cli.mjs", "scripts/fetch.ts", "--once"], {
		env,
		stdio: ["ignore", "pipe", "inherit"],
	});
	stored.stdout.setEncoding("utf8");
	stored.stdout.on("data", (chunk) => process.stdout.write(chunk));
	stored.on("exit", (code) => mark(`fetcher exited ${code}`));
}, 12_000);

setTimeout(() => close(woke ? "closing" : "closing — no wake observed"), 22_000);
