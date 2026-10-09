/**
 * Offline check for the Microsoft Graph source: a stubbed Graph, the real spool, the real fetcher.
 * No credentials, no network, no session.
 *
 *   npm run graph-check
 *
 * What this cannot prove: that Microsoft accepts the app registration, the scopes or the sign-in.
 * That needs the live account, and the person who owns it.
 */

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pi-email-listener-graph-"));
mkdirSync(join(root, "mail"), { recursive: true });
process.env.PI_EMAIL_LISTENER_MAIL_DIR = join(root, "mail");

const { graphSource } = await import("../src/graph.ts");
const { syncAccount } = await import("../src/fetcher.ts");
const { readCursor, readIndex } = await import("../src/spool.ts");

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}

const message = (id: string, receivedDateTime: string, subject: string) => ({
	id,
	receivedDateTime,
	subject,
	hasAttachments: false,
	from: { emailAddress: { name: "Dana Whitfield", address: "dana@example.com" } },
	toRecipients: [{ emailAddress: { address: "andrei@example.com" } }],
	ccRecipients: [],
});

const raw = [
	"From: Dana Whitfield <dana@example.com>",
	"To: andrei@example.com",
	"Subject: from Graph",
	"Date: Fri, 09 Oct 2026 14:32:07 +0200",
	"Message-ID: <graph@example.com>",
	"",
	"The message as MIME, which is what the spool keeps.",
].join("\r\n");

const LONG_ID = "A".repeat(120);
// Newest first inside the page on purpose: Graph does not promise an order, and the spool needs one.
const pages: Record<string, unknown>[] = [
	{
		value: [message("id-2", "2026-10-09T13:00:00Z", "Second"), message("id-1", "2026-10-09T12:00:00Z", "First")],
		"@odata.nextLink": "https://graph.microsoft.com/v1.0/next-page",
	},
	{
		value: [message("id-3", "2026-10-09T14:00:00Z", "Third"), { id: "id-4", "@removed": {} }, message(LONG_ID, "2026-10-09T15:00:00Z", "Long id")],
		"@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta-link",
	},
];

const requested: string[] = [];
const fetchImpl = (async (url: RequestInfo | URL) => {
	const target = String(url);
	requested.push(target);
	if (target.includes("/$value")) return new Response(raw, { status: 200 });
	const page = pages.shift() ?? { value: [], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta-link" };
	return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const source = graphSource("outlook", {
	since: "2026-10-01T00:00:00Z",
	folder: "inbox",
	accessToken: async () => "stub-token",
	fetchImpl,
});
const account = { name: "outlook", provider: "graph", clientId: "stub-client" };

// ---------------------------------------------------------------- first pass

check("the whole mailbox half runs off a stubbed Graph", (await syncAccount(account, source)) === 4);

const decoded = (url: string) => decodeURIComponent(url).replace(/\+/g, " ");
check(
	"the first request is the inbox delta, bounded by the start date",
	decoded(requested[0] ?? "").includes("/me/mailFolders/inbox/messages/delta") &&
		decoded(requested[0] ?? "").includes("receivedDateTime ge 2026-10-01T00:00:00Z"),
);
check("it follows the page link Graph hands back", requested[1] === "https://graph.microsoft.com/v1.0/next-page");
check(
	"every message is fetched as raw MIME",
	requested.filter((url) => url.includes("/$value")).length === 4,
);
check("a removal in the delta is not stored", !readIndex("outlook").some((one) => one.id === "id-4"));

const index = readIndex("outlook");
check(
	"the spool reads oldest first, whatever order Graph used",
	index.map((one) => one.subject).join(",") === "First,Second,Third,Long id",
);
check(
	"the envelope comes from the message metadata",
	index[0]?.from.name === "Dana Whitfield" && index[0]?.to[0] === "andrei@example.com",
);
check(
	"a message id too long for a file name gets a hashed tail",
	/^A{48}-[0-9a-f]{8}\.eml$/.test(index[3]?.file ?? ""),
);

// ---------------------------------------------------------------- second pass

check("the delta link is the stored cursor", (readCursor("outlook")?.next as string) === "https://graph.microsoft.com/v1.0/delta-link");

const before = requested.length;
check("a second pass stores nothing new", (await syncAccount(account, source)) === 0);
check(
	"and asks the delta link rather than re-listing the folder",
	requested[before] === "https://graph.microsoft.com/v1.0/delta-link",
);
check("the folder and account are remembered in the cursor", readCursor("outlook")?.folder === "inbox");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
