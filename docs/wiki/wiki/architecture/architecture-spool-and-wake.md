---
title: "Two halves joined by a spool: the fetcher fills files, the session reads them"
type: architecture/layer
topic: architecture
summary: "pi-email-listener is a standalone fetcher that owns the mailbox connection and writes .eml files plus an append-only index under the agent directory, and an in-session pi extension that reads that spool and turns the agent. The split exists because a wake can only be sent from inside the session being woken, while the fragile half — OAuth, reconnect, sync position — must outlive pi restarts."
tags: [architecture, spool, pi-extension, wake, oauth, fetcher]
updated: 2026-10-09
sources: [home: raw/sessions/2026-10-09-session-2026-10-09-055057.md]
files:
  [
    C:/Coding/pi-email-listener/src/spool.ts,
    C:/Coding/pi-email-listener/src/source.ts,
    C:/Coding/pi-email-listener/src/config.ts,
    C:/Coding/pi-email-listener/src/fetcher.ts,
    C:/Coding/pi-email-listener/src/wake.ts,
    C:/Coding/pi-email-listener/src/extension.ts,
    C:/Coding/pi-email-listener/docs/PLAN.md,
  ]
claims:
  - id: c1
    text: "The package is two halves joined by files on disk. The fetcher (src/fetcher.ts) owns the provider connection and the sync position and writes, per account under `<agent dir>/mail/<account>/`, the raw message, one append-only `index.jsonl` line and its own `cursor.json`; the extension (src/extension.ts) reads only those files and turns the agent. The fetcher imports no session API at all."
    status: verified
    support: 0.9
    evidence: ["file: src/fetcher.ts — imports config, source and spool only; the module has no ExtensionAPI import", "file: src/spool.ts — mailRoot() is `<agent dir>/mail`, overridable with PI_EMAIL_LISTENER_MAIL_DIR", "command: PI_EMAIL_LISTENER_CONFIG=<temp config> PI_EMAIL_LISTENER_MAIL_DIR=<temp> npm run fetch:once → 'stored 2026-10-09T12:32:07.000Z · dana@example.com · Q3 rollout → a-example.com.eml', exit 0, with no pi process involved"]
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
---

## Shape

```
mailbox ──▶ fetcher (always on, no pi) ──▶ spool of files ──▶ extension in a session ──▶ turn
             OAuth, reconnect, catch-up      .eml + index      opt-in via /email-watch
```

## Modules

| File | Owns |
|---|---|
| `src/source.ts` | A provider adapter as two calls: `listNew(cursor)` and `fetch(id)`, with a cursor only the adapter interprets. `fixtureSource` reads a directory of `.eml` files, so the pipeline is testable with no credentials. |
| `src/spool.ts` | The layout: raw message, `index.jsonl`, `cursor.json`, `delivered.json` per account. Store never overwrites an existing file. |
| `src/config.ts` | Accounts from `<agent dir>/pi-email-listener.json`, movable with `PI_EMAIL_LISTENER_CONFIG`. |
| `src/fetcher.ts` | One pass per account, ids in the index skipped, cursor advanced past the newest arrival, one broken account not stopping the others. Polls forever or `--once`. |
| `src/wake.ts` | What is undelivered, the pointer text, and whether a message needs care. No pi imports: this is the half the stub test drives directly. |
| `src/extension.ts` | The pi wiring: the command, the timer, `sendMessage`, the `tool_call` quarantine, teardown on `session_shutdown`. |

## Invariants

- The fetcher never calls into pi, and the extension never touches a mailbox. Adding a provider means
  writing `listNew` and `fetch` and nothing else.
- A message is stored once. The file name is derived from the provider id, collisions get a suffix,
  and the index is append-only.
- The wake carries a pointer, never a body (§ [no gate and the pointer](../decisions/decision-no-gate-and-pointer.md)).
- Nothing turns the agent until the user asks for it in that session; the always-on case is
  `PI_EMAIL_LISTENER_AUTOSTART`, which exists for a session meant to be woken and for the RPC test.

## Not built yet

A real provider adapter (IMAP or Graph), token storage, reconnect, and catch-up reporting when a
watch is turned on over a large backlog — today that delivers every undelivered message.
