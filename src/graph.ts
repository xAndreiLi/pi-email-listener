/**
 * Microsoft Graph as a mail source — Outlook, Outlook.com and Microsoft 365.
 *
 * Two calls per pass: a delta query on one folder, which returns what changed since the stored
 * cursor, and the raw MIME of each new message. Delta is used rather than a plain list because the
 * cursor it hands back is the sync position, and because it accepts a `receivedDateTime` filter —
 * which is what stops a first run from copying an entire mailbox to disk.
 *
 * The message is stored exactly as it arrives, so everything downstream (the envelope, the
 * quarantine decision, the pointer) is the same code the fixture and any other provider go through.
 */

import { type MailSource, type Cursor, type Envelope } from "./source.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
/** Enough to catch up in a pass or two without making one pass unbounded. */
const MAX_PAGES = 10;

export interface GraphOptions {
	/** Defaults to the mailbox of whoever signed in. */
	mailbox?: string;
	/** Folder display name or well-known name. Inbox by default. */
	folder?: string;
	/** Where a first sync starts. Defaults to when the first pass runs. */
	since?: string;
	accessToken: () => Promise<string>;
	fetchImpl?: typeof fetch;
}

interface GraphMessage {
	id: string;
	receivedDateTime?: string;
	subject?: string;
	from?: { emailAddress?: { name?: string; address?: string } };
	toRecipients?: { emailAddress?: { address?: string } }[];
	ccRecipients?: { emailAddress?: { address?: string } }[];
	"@removed"?: unknown;
}

export function graphSource(account: string, options: GraphOptions): MailSource {
	const doFetch = options.fetchImpl ?? fetch;
	const folder = options.folder ?? "inbox";
	const mailbox = options.mailbox ?? "me";
	const since = options.since ?? new Date().toISOString();

	async function api(url: string, accept = "application/json"): Promise<unknown> {
		const response = await doFetch(url, {
			headers: { authorization: `Bearer ${await options.accessToken()}`, accept },
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Graph ${response.status} for ${url.split("?")[0]}${body ? ` — ${body.slice(0, 200)}` : ""}`);
		}
		return accept === "application/json" ? response.json() : response.text();
	}

	function deltaUrl(): string {
		const query = new URLSearchParams({
			$select: "id,receivedDateTime,subject,from,toRecipients,ccRecipients,hasAttachments",
			$filter: `receivedDateTime ge ${since}`,
			$top: "50",
		});
		return `${GRAPH}/${mailbox}/mailFolders/${folder}/messages/delta?${query}`;
	}

	return {
		async listNew(cursor: Cursor | undefined) {
			const first = typeof cursor?.next === "string" ? cursor.next : deltaUrl();
			const envelopes: Envelope[] = [];
			let url: string | undefined = first;
			let next: string | undefined;
			let deltaLink: string | undefined;

			for (let page = 0; url && page < MAX_PAGES; page++) {
				const body = (await api(url)) as {
					value?: GraphMessage[];
					"@odata.nextLink"?: string;
					"@odata.deltaLink"?: string;
				};
				for (const message of body.value ?? []) {
					// A deletion is not something to keep a copy of, but it is a change.
					if (message["@removed"] || !message.id) continue;
					envelopes.push({
						id: message.id,
						receivedAt: message.receivedDateTime ?? new Date().toISOString(),
						from: {
							...(message.from?.emailAddress?.name ? { name: message.from.emailAddress.name } : {}),
							address: message.from?.emailAddress?.address ?? "",
						},
						to: (message.toRecipients ?? []).map((one) => one.emailAddress?.address ?? "").filter(Boolean),
						cc: (message.ccRecipients ?? []).map((one) => one.emailAddress?.address ?? "").filter(Boolean),
						subject: message.subject ?? "",
					});
				}
				next = body["@odata.nextLink"];
				deltaLink = body["@odata.deltaLink"];
				url = next;
			}

			// Oldest first, so the spool reads in the order mail arrived and the cursor's "newest
			// received" is the last line written.
			envelopes.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
			return {
				envelopes,
				cursor: {
					// A page that was not reached is the next place to continue, so nothing is skipped
					// when a pass stops early.
					next: next ?? deltaLink ?? first,
					since,
					account,
					folder,
				} satisfies Cursor,
			};
		},

		async fetch(id: string) {
			// $value is the message as MIME, which is what the spool stores for every provider.
			return (await api(`${GRAPH}/${mailbox}/messages/${encodeURIComponent(id)}/$value`, "text/plain")) as string;
		},
	};
}
