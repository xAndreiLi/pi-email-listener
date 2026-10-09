---
title: "Two halves joined by a spool: the fetcher fills files, the session reads them"
type: architecture/layer
topic: architecture
summary: "pi-email-listener is a standalone fetcher that owns the mailbox connection and writes .eml files plus an append-only index under the agent directory, and an in-session pi extension that reads that spool and turns the agent. The split exists because a wake can only be sent from inside the session being woken, while the fragile half — OAuth, reconnect, sync position — must outlive pi restarts. Providers plug in through two calls, and the sync cursor belongs to the provider."
tags: [architecture, spool, pi-extension, wake, oauth, fetcher, providers]
updated: 2026-10-09
sources: [home: raw/sessions/2026-10-09-session-2026-10-09-055057.md]
files:
  [
    C:/Coding/pi-email-listener/src/spool.ts,
    C:/Coding/pi-email-listener/src/source.ts,
    C:/Coding/pi-email-listener/src/config.ts,
    C:/Coding/pi-email-listener/src/fetcher.ts,
    C:/Coding/pi-email-listener/src/graph.ts,
    C:/Coding/pi-email-listener/src/microsoft-auth.ts,
    C:/Coding/pi-email-listener/src/wake.ts,
    C:/Coding/pi-email-listener/src/extension.ts,
    C:/Coding/pi-email-listener/docs/PLAN.md,
  ]
claims:
  - id: c1
    text: "The package is two halves joined by files on disk. The fetcher (src/fetcher.ts) owns the provider connection and the sync position and writes, per account under `<agent dir>/mail/<account>/`, the raw message, one append-only `index.jsonl` line and its own `cursor.json`; the extension (src/extension.ts) reads only those files and turns the agent. The fetcher imports no session API at all."
    status: verified
    support: 0.9
    evidence: ["file: src/fetcher.ts — imports config, source, spool, graph and microsoft-auth only; the module has no ExtensionAPI import", "file: src/spool.ts — mailRoot() is `<agent dir>/mail`, overridable with PI_EMAIL_LISTENER_MAIL_DIR", "command: PI_EMAIL_LISTENER_CONFIG=<temp config> PI_EMAIL_LISTENER_MAIL_DIR=<temp> npm run fetch:once → 'stored 2026-10-09T12:32:07.000Z · dana@example.com · Q3 rollout → a-example.com.eml', exit 0, with no pi process involved"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "The split is forced by where a wake can come from: turning an agent means `pi.sendMessage(…, {triggerTurn: true})` from an extension loaded in that session, so nothing outside the session can start one. A mailbox connection that depends on a session being open would forget its position and drop its tokens every time pi restarts, which is why the connection lives in a process that has no opinion about sessions."
    status: verified
    support: 0.85
    evidence: ["file: src/extension.ts — the only file that imports ExtensionAPI, and the only place pi.sendMessage is called", "file: docs/PLAN.md — §3 records the alternative shapes considered (a listener owning an RPC/SDK-hosted session) and why the spool seam keeps them open without a rewrite", "command: npm run fetch:once runs the whole mailbox half in a plain jiti process, which is what makes the seam real rather than aspirational"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c3
    text: "Delivery to the agent is tracked as an index line count per account (`delivered.json`), not as a list of ids: a restart neither repeats nor skips, and it costs one small file. A torn or unreadable cursor falls back to 0 and re-delivers, because a repeated turn is cheap and a skipped message is not."
    status: verified
    support: 0.9
    evidence: ["file: src/wake.ts — undelivered() filters index lines greater than the delivered count; readDelivered() returns 0 when the file is missing or unparsable", "command: npm run load-check → 'ok nothing is delivered twice' and 'ok the spool still holds the message once'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c4
    text: "Watching is opt-in per session and nothing is sent before it is asked for: `/email-watch` toggles it, and turning it on delivers whatever the spool already holds. The first available message is sent with `triggerTurn` when the session is idle and `deliverAs: \"followUp\"` when it is not, so every message still gets its own turn instead of being folded into one."
    status: verified
    support: 0.9
    evidence: ["file: src/extension.ts — registerCommand('email-watch') toggles the timer; tick() chooses {triggerTurn: true} only for the first message of a pass while ctx.isIdle()", "command: npm run load-check → 'ok nothing is sent before the user asks for it', 'ok the command reports that it started', 'ok mail turns the agent once', 'ok every message turns the agent, gate or no gate'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c5
    text: "A turn started by a message carrying a link or an attachment is quarantined: the `tool_call` handler refuses `bash`, `edit` and `write` with a reason naming the message, while reading stays available, and the refusal is lifted on `agent_settled` — the point at which the human can see what arrived. Detection is header-based (Content-Disposition: attachment, filename=) plus a URL search in the body, so a link hidden inside an encoded part is not caught."
    status: verified
    support: 0.85
    evidence: ["file: src/extension.ts — pi.on('tool_call', …) returns {block: true, reason} for GATED_TOOLS while quarantined; pi.on('agent_settled', …) clears it", "file: src/wake.ts — needsCare() tests attachment headers and http(s) in the body, with the limit recorded as a shortcut comment", "command: npm run load-check → 'ok a message with a link blocks the shell', 'ok it blocks writing too', 'ok reading is still allowed', 'ok the tools come back when the turn ends'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c6
    text: "The sync cursor belongs to the provider: `listNew(cursor)` returns `{ envelopes, cursor }` and the fetcher stores whatever comes back without interpreting it. A fixture returns the newest date it saw, Graph returns the deltaLink or the page it stopped on. The cursor is persisted even when a pass stored nothing, because a page that was consumed still moved the position."
    status: verified
    support: 0.9
    evidence: ["file: src/source.ts — the MailSource interface returns { envelopes, cursor }, and fixtureSource builds its own { lastSeenAt }", "file: src/fetcher.ts — syncAccount writes the returned cursor when it has any keys, rather than computing one from the newest arrival", "command: npm run graph-check → 'the delta link is the stored cursor', 'and asks the delta link rather than re-listing the folder', 'the folder and account are remembered in the cursor'", "command: the first run of graph-check failed with 'TypeError: envelopes is not iterable', which is what forced the cursor to move to the provider where the design said it belonged"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c7
    text: "A message reaching the spool really does start a turn in a settled session. Driven over RPC on pi 1.1.0 with the extension loaded: the agent settled at 3.6 s, the fetcher stored a message at 13.1 s, and at 13.4 s a turn started with no prompt behind it carrying the pointer `[email] Dana Whitfield <dana@example.com> · Q3 rollout needs a decision`."
    status: verified
    support: 0.95
    evidence: ["command: npm run live → '3.6s agent_settled #1', '13.1s fetcher exited 0', '13.4s agent_start (no prompt behind it — this is the wake)', '13.4s wake message: [email] Dana Whitfield <dana@example.com> · Q3 rollout needs a decision', 'PASS: a spooled message started a turn by itself, carrying the pointer', 973 protocol records"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c8
    text: "The IMAP source does not keep a dead connection. Any failure inside a mailbox operation drops the client and logs it out best-effort, so the next pass reconnects rather than failing forever on a socket the server has already closed — and the error still reaches the caller, so the failure is visible rather than silent. The interval between passes is still fixed; there is no backoff yet."
    status: verified
    support: 0.85
    evidence: ["file: src/imap.ts — withMailbox() sets the cached client to undefined and logs it out in the catch, then rethrows", "command: npm run imap-check → 'a dropped connection surfaces as an error rather than silence', 'the dead client is dropped', 'and the next pass connects again', 'which is the second connect'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## Shape

```
mailbox ──▶ fetcher (always on, no pi) ──▶ spool of files ──▶ extension in a session ──▶ turn
             OAuth, reconnect, catch-up      .eml + index      opt-in via /email-watch
```

## Modules

| File | Owns |
|---|---|
| `src/source.ts` | A provider adapter as two calls: `listNew(cursor) → { envelopes, cursor }` and `fetch(id) → raw message`, plus an optional `close()` for a source that holds a connection. `fixtureSource` reads a directory of `.eml` files. |
| `src/imap.ts` | The front door: a mailbox the agent owns, read over IMAP with app passwords. Cursor is `uidValidity` plus the highest UID, resets when the server rebuilds, first pass takes the newest 50, and nothing is ever marked read, moved or deleted. |
| `src/graph.ts` | Microsoft Graph: delta on one folder bounded by `receivedDateTime ge`, paging, MIME through `$value`. See [the Graph page](microsoft-graph-source.md). |
| `src/microsoft-auth.ts` | The device code sign-in and the token store, refreshed when close to expiring. |
| `src/spool.ts` | The layout: raw message, `index.jsonl`, `cursor.json`, `delivered.json` per account. Store never overwrites an existing file. |
| `src/config.ts` | Accounts from `<agent dir>/pi-email-listener.json`, movable with `PI_EMAIL_LISTENER_CONFIG`. Provider-specific fields: `dir` for fixture, `clientId`/`tenant`/`mailbox`/`folder`/`since` for graph. |
| `src/fetcher.ts` | One pass per account, ids in the index skipped, the provider's cursor stored, one broken account not stopping the others. Polls forever or `--once`. Long message ids get a hashed file name. |
| `src/wake.ts` | What is undelivered, the pointer text, and whether a message needs care. No pi imports: this is the half the stub test drives directly. |
| `src/extension.ts` | The pi wiring: the command, the timer, `sendMessage`, the `tool_call` quarantine, teardown on `session_shutdown`. |

## Invariants

- The fetcher never calls into pi, and the extension never touches a mailbox. Adding a provider means
  writing `listNew` and `fetch` and nothing else.
- A message is stored once. The file name derives from the provider id — hashed at the tail when the
  id is too long for a name — collisions get a suffix, and the index is append-only.
- The wake carries a pointer, never a body
  (§ [no gate and the pointer](../decisions/decision-no-gate-and-pointer.md)).
- Nothing turns the agent until the user asks for it in that session; the always-on case is
  `PI_EMAIL_LISTENER_AUTOSTART`, which exists for a session meant to be woken and for the RPC test.
- Credentials stay out of the repository: the refresh token is written beside the spool.

## Alternatives considered, and kept open

The shape rejected for v1 is a listener that owns a pi session — spawning one in RPC mode or hosting
it through the SDK. It is a real product ("an agent on duty" with nobody at the terminal) but a worse
one for the case this package starts from: the session it wakes is not the one the user is sitting
in. The spool seam keeps it available: because the fetcher's only output is files, running it as a
supervised process, or pointing a hosted agent at the same spool, is a deployment change rather than
a rewrite. Andrei accepted the seam with that reasoning ("I like the recommendation", 2026-10-09).

## Not built yet

A reply path from the agent's own address (the address makes it possible; nothing sends today), backoff
between passes around a mailbox that keeps failing, catch-up reporting when a watch is turned on over
a large backlog, and the `Fwd:` heuristic is deliberately shallow — it recovers the usual top-quoted
`From:` line and nothing more.
