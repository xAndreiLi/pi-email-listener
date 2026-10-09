# pi-email-listener — design

Status: **design agreed 2026-10-09; the first milestone is built.** Decisions were taken with Andrei
on 2026-10-09 and are recorded in his wiki as
`decisions/decision-email-listener-design.md`. What exists today is M1 (§8) — the fetcher, the spool
and a fixture mail source. The wake is not built yet.

---

## 1. What it is

The ears. The agent has a mailbox of its own, and mail reaches it because somebody cc'd the
agent on a thread or forwarded it a message. Pi turns the agent when that mail arrives, handing over
the message**, never a summary of it. The agent opens the message itself.

The gap it closes: mail reaches an agent today only when a human copies it there. The agent cannot
notice anything on its own — the human *is* the transport layer between the inbox and the agent.
This package takes the human off that path for **awareness** and leaves them on it for **judgement
and replies**.

## 2. Who it is for

A project manager's ecosystem *is* a mailbox: clients, contractors, vendors, colleagues and
automated systems, carrying deadlines, scope changes, blockers, invoices and "can you just…". None of
it exists for the agent unless someone pastes it in.

Three separate jobs, in increasing ambition:

1. **Wake on arrival** — "something arrived that you should look at now." This is the package.
2. **Catch-up on demand** — "what happened in the last three hours?", answered from the mailbox
   rather than by the human scrolling it. Falls out of (1) once the messages are on disk.
3. **Continuity** — the agent keeps project state current from mail: threads it is tracking,
   promises made, dates, who is who. This is what turns a notifier into a grasp of the ecosystem, it
   is a different design (it writes somewhere — the agent's own notes or wiki), and it is
   deliberately **not in v1**.

## 3. Architecture — decided: a spool between two halves

```
mailbox ──▶ fetcher (always on, no pi) ──▶ spool of files ──▶ extension in a session ──▶ turn
             OAuth, reconnect, catch-up      .eml + index      opt-in per session
```

**Why not the obvious shapes.** A separate process cannot wake a session it did not start: the only
ways to turn an agent are `pi.sendMessage(…, {triggerTurn: true})` and `pi.sendUserMessage(…)`, both
of which exist only inside an extension loaded in that session. RPC and the SDK both mean *owning*
the pi process — an agent on duty in a session nobody is sitting in, which is a different product
from "my agent, in the window I already have open, notices something".

So the work is split where the two halves have different lifetimes:

- **The fetcher owns the fragile half** — the provider connection, the tokens, the reconnect, the
  sync position. It runs whether or not pi is open, and its only output is files. That keeps a
  mailbox connected for days without a session, and it is testable with no pi and no network.
- **The extension owns the wake** — it tails the spool and turns the session. Nothing about the
  wake path is provider-specific.
- **The seam is the insurance.** Because the fetcher's output is files, a hosted or always-on agent
  (RPC/SDK, or the fetcher itself as a process) is a later configuration change rather than a
  rewrite.

**Opt-in waking.** Tracking is unconditional; being woken is a service the user switches on. A
session is only turned by mail after the user sets that up in the session — nothing wakes an agent
by surprise.

## 4. Every message turns the agent — there is no gate

The job-listener design (deterministic events always wake, ambiguous ones are judged by a model) was
considered and rejected here. Every message that arrives turns the agent. No priority lists, no
bulk or no-reply suppression, no batching, no model judging arrivals.

The reasoning that made job-listener's gate worthwhile does not transfer: there, the ambiguous
question is whether a running process's *middle output* is worth interrupting for, and a missed wake
strands an agent on a job that is already over. For mail, the cost of missing a message is the
larger one, and "is this message worth interrupting for?" is answered by turning rather than by
judging.

Consequences to design around, not to hide:

- Volume is the user's choice: a mailbox that receives 200 messages a day turns the agent 200 times.
- Messages that arrive while a turn is running queue rather than interrupt it; the queue is pi's,
  and each queued message still gets its own turn.
- **The wake payload is a pointer**: sender, subject, received time, account and the spool file to
  read. No body. The body is one `read` away, and bodies in the transcript are permanent.

## 5. Intake: an address the agent owns, with Graph as an option

**The front door is an email address the agent owns.** You cc the agent on a thread, or forward it a
message, and the fetcher reads that mailbox over IMAP. Chosen because it is the only route with no app
registration, no tenant, no consent and no client on the machine — and because the sender's provider
stops mattering: whatever anyone ccs or forwards from arrives as mail, so one adapter covers Outlook,
Gmail, Fastmail, Proton Bridge, self-hosted and a corporate Exchange mailbox.

- **The mailbox is the user's to choose.** A new Gmail per agent is easiest: free, and app passwords
  still work for IMAP with 2-Step Verification on — no Cloud project, no consent screen, no
  verification review, no administrator.
- **Nothing is ever modified.** No Seen, no moves, no deletes: the mailbox looks untouched, which is
  what makes it safe to point at an address somebody cares about.
- **cc beats forward.** A forward rewrites the envelope — the real sender and the thread survive only
  in a quoted block — while a cc preserves both. originalSender() recovers the usual top-quoted From:
  when a message is a forward, so the pointer names the actual author instead of the forwarder. It is
  a heuristic, and says nothing rather than guessing.
- **The corporate case is a smaller ask, not no ask.** An Exchange Online tenant created since 2021 has
  automatic external forwarding off by default, and admins can block external inbox rules (5.7.520),
  so a corporate user forwards by hand or asks their admin to allow it — "let me forward mail to my
  assistant's address" rather than "approve an app that can read my whole mailbox".

**Graph remains the other bargain**: read your own Microsoft mailbox directly, see everything, and
obtain an app registration for it (provider "graph", device code sign-in, a since date to bound the
first sync). Better for someone who can get consent and wants the whole mailbox rather than what they
hand over. IMAP needs none of that and is the front door.

**The adapter is still two calls** — listNew(cursor) -> { envelopes, cursor } and fetch(id) -> raw
message, plus an optional close() — and the cursor belongs to the provider: fixture keeps the newest
date it saw, Graph keeps a deltaLink, IMAP keeps uidValidity plus the highest UID and starts again when
the server rebuilds the mailbox.

## 6. Trust

Mail is written by strangers and arrives in a context that has shell and file access — the first
genuinely untrusted input this agent gets. Job output came from the agent's own commands.

- A mail-triggered turn is **quarantined**: the message is framed as untrusted third-party text and
  `bash`, `edit` and `write` are refused — `pi.on("tool_call", …)` fires before a tool executes and
  can return `{ block: true, reason }` — until the human has seen the message.
- Nothing automatic happens on the far side of a message: no auto-reply, no opening attachments, no
  fetching links. **v1 has no send path at all.**
- The spool holds plaintext mail and possibly a refresh token: gitignored, outside any synced
  folder, tokens in the keychain or an agent-dir file with restrictive permissions, never in the
  repo or the transcript.
- **Capture:** pi's wiki capture fires on settle, so a mail-triggered turn is an *unattended* turn
  that would copy a stranger's message into `raw/sessions/`. A session that runs the listener either
  has capture off or must not be the session that reads bodies. This is recorded in Andrei's wiki
  (`decision-secret-hygiene-in-capture.md`).

## 7. Tools

None in v1. The wake hands over a file path and the agent already has `read`, so the listener is the
interface rather than a mail client bolted into the agent. `email_recent`/`email_search` get added
when "what else came in?" stops being answerable by listing a directory; `email_read` and
`email_archive` are later and deliberate. **Sending is not on that list and will not be**: a reply
stays a human act from the human's own address, which is what keeps an agent's mistakes
recoverable. That is a boundary, not a backlog item.

## 7a. Watching is opt-in

`/email-watch` turns watching on for this session and the same command turns it off. Nothing is
watched until it is asked for, and when it is, the messages already in the spool are delivered, so
turning it on after a day away catches up. Starting it says so out loud, including the capture
warning: a mail turn puts a stranger's message in the transcript and capture copies the transcript on
settle. A session that should always be woken sets `PI_EMAIL_LISTENER_AUTOSTART`, which is also how
the RPC test turns it on, a test being unable to type a command.

## 7b. Setup is a command, and it stays on

`/email-setup` is the whole of onboarding: it asks what kind of mailbox the agent should have, opens
the two pages a person needs (signup, app passwords), takes the address and the app password, verifies
the login before writing anything, then writes the account and offers to keep the fetcher running.
Nothing is written when verification fails, and cancelling writes nothing at all. The wizard is logic
(`src/setup.ts`) with the dialogs injected, so `scripts/setup-check.ts` drives the whole conversation
against a stubbed mailbox — a wizard that only exists inside a terminal is a wizard nobody can test.

`service.autoStart` is what makes it always on: any session that starts makes sure the detached
fetcher (`src/service.ts`) is running, one file records it, and `/email-service` reports, starts and
stops it. It is a process that outlives the session, not an operating-system service — surviving a
reboot needs a scheduled task or a systemd unit, and nobody has needed that yet.

## 8. Milestones

- **M1 — fetcher and spool. Built.** `src/source.ts` (the two-call source interface, plus a fixture
  source that reads a directory of `.eml` files), `src/spool.ts` (per-account `.eml` files,
  append-only `index.jsonl`, opaque `cursor.json`), `src/config.ts` (accounts from
  `<agent dir>/pi-email-listener.json`, overridable by env), `src/fetcher.ts` (one pass per account,
  dedup against the index, cursor advanced, one broken account does not stop the others), and
  `scripts/self-check.ts` (17 assertions, no network, no credentials, no session). Proves: mail
  reaches the spool, a restart does not duplicate it, and nothing here needs pi.
- **M2 — the wake.** The extension: the user sets the service up in a session, the spool is tailed,
  each undelivered message turns the session with its pointer, the queue holds while a turn runs,
  `tool_call` quarantine applies, and `session_shutdown` tears down idempotently. Tested per the
  wiki's pi-extension testing procedure: stub `pi` API offline, then drive a real pi over RPC and
  observe the wake. **Built and verified offline:** `src/wake.ts` holds the testable half
  (undelivered lines, the pointer text, whether a message carries a link or an attachment) and
  `src/extension.ts` the pi wiring (`sendMessage` with `triggerTurn` when idle and
  `deliverAs: "followUp"` when not; `tool_call` refusing `bash`/`edit`/`write` during a quarantined
  turn, released on `agent_settled`; idempotent teardown on `session_shutdown`; watching opt-in via
  `/email-watch`, so no session is turned by surprise and a backlog is delivered when it is turned
  on). `scripts/load-check.ts` drives all of it against a stub pi API — 24 checks, no network, no
  model, no session. **Proven live.** `scripts/live-test.mjs` is written
  for that — drive a real pi over RPC, settle it, spool a message, watch for a turn with no prompt
  behind it — and passes: on 2026-10-09 the agent settled at 3.6 s, a message reached the spool at 13.1 s, and at 13.4 s a turn started with no prompt behind it carrying `[email] Dana Whitfield <dana@example.com> · Q3 rollout needs a decision`.
- **M3 — the front door. Built, unproven against a real mailbox.** src/imap.ts owns the connection
  across passes; the cursor is uidValidity plus the highest UID, and a changed uidValidity starts the
  mailbox over rather than trusting stale UIDs; a first pass takes the newest 50 so a new mailbox shows
  something without copying a stranger's history; nothing is ever marked read, moved or deleted. Plus
  originalSender() for forwarded mail. scripts/imap-check.ts drives it against a stubbed server — 17
  checks, no credentials, no network. **Not yet proven: that a real Gmail account accepts an app
  password and that mail arrives.** That needs a mailbox and its password, which is Andrei's to create.
- **M3b — the Outlook provider. Built, unproven against Microsoft.** src/graph.ts (delta on a folder
  bounded by receivedDateTime ge, paging followed with an unfinished page kept as the cursor, @removed
  entries skipped, MIME fetched through $value) and src/microsoft-auth.ts (device code sign-in, token
  store beside the spool). scripts/graph-check.ts and scripts/auth-check.ts drive both against stubs.
  **Not yet proven: that Microsoft accepts an app registration, the scopes and the sign-in** — which
  needs a tenant Andrei does not yet have, and is no longer on the path to a working mailbox.
- **M4 — catch-up reporting.** What the agent is told after downtime: the newest *k* messages and
  how many were skipped. Today, turning on a watch with a backlog delivers every message in it.
- **M5 — always on. Built.** src/service.ts runs the fetcher as a detached process with plain node
  (Node strips the types itself, so no loader and no build step), records its pid and start time in one
  file, refuses to start a second copy, keeps its output in service.log, and can be stopped from any
  later session. scripts/service-check.ts starts it for real, asserts it is one process, watches it
  fetch into the spool, then stops it. **Not built: surviving a reboot** — a Windows scheduled task or
  a systemd unit, and it is the last piece between this and never thinking about it again.
## 9. Risks

- **OAuth friction is the adoption killer.** Any path that begins "register an app in Entra and ask
  IT" loses a project manager in the first five minutes. Consumer mailboxes are what make this
  installable by one person; corporate M365 is what makes it sellable to a company, and it is a
  longer road with a gatekeeper on it.
- **Volume without a gate.** Turning on every message is deliberate, but it means the transcript
  grows with the mailbox. If this turns out to hurt in practice, the fix is a decision the user
  makes, not a filter the package hides.
- **Prompt injection** (§6) — a stranger's email arriving in an agent that has shell access.
- **"You have mail" is not progress.** Turning the agent only matters if it can say what a message
  *means for what we were doing*. Otherwise the human still reads the mailbox and the agent is
  overhead. §2 job 3 is where the value actually lives, and it is out of v1 on purpose.
