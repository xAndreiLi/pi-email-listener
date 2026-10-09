# pi-email-listener — design

Status: **design agreed 2026-10-09; the first milestone is built.** Decisions were taken with Andrei
on 2026-10-09 and are recorded in his wiki as
`decisions/decision-email-listener-design.md`. What exists today is M1 (§8) — the fetcher, the spool
and a fixture mail source. The wake is not built yet.

---

## 1. What it is

The ears. Pi watches a mailbox and turns the agent when mail arrives, handing over **a pointer to
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

## 5. Providers

The protocol layer is the least interesting part of this and the most likely to eat the schedule.

- **Microsoft (Outlook.com, M365):** basic authentication for IMAP/POP/SMTP is switched off in
  Exchange Online, so there is no app-password shortcut. Access means an app registration in Entra
  and OAuth2. For a personal mailbox that is a one-time setup the user does themselves; in a
  **corporate tenant the mailbox permission commonly needs admin consent** — the client's IT
  department. That is an adoption wall, and a product decision rather than a technical one.
- **Reading without a public endpoint:** Graph delta queries (`/me/messages/delta`) poll cheaply and
  return only what changed. Graph *change notifications* are push but need a public HTTPS endpoint,
  lifecycle notifications and renewal every few days — not v1.
- **IMAP (everything else):** one adapter covers Gmail, Fastmail, Proton Bridge, most providers and
  self-hosted; Gmail also needs OAuth2. IMAP IDLE makes arrival near-push.
- **The adapter is two calls**, and that is the whole abstraction: `listNew(cursor) → Envelope[]`
  and `fetch(id) → raw message`, with an opaque cursor the adapter defines. Two implementations
  before v1 ships; everything above that line stays provider-agnostic.

The first target is Andrei's personal address, and **its contents are not to be read, explored or
ingested** — it is a test target. The implementation and its checks must not depend on anybody
reading his mail: the fetcher is developed against fixtures, and the live account is only connected
when he supplies credentials himself and runs it.

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
when "what else came in?" stops being answerable by listing a directory; `email_read`,
`email_archive` and `email_draft` (never auto-send) are later and deliberate — every registered tool
is context the model pays for on every request.

## 7a. Watching is opt-in

`/email-watch` turns watching on for this session and the same command turns it off. Nothing is
watched until it is asked for, and when it is, the messages already in the spool are delivered, so
turning it on after a day away catches up. Starting it says so out loud, including the capture
warning: a mail turn puts a stranger's message in the transcript and capture copies the transcript on
settle. A session that should always be woken sets `PI_EMAIL_LISTENER_AUTOSTART`, which is also how
the RPC test turns it on, a test being unable to type a command.

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
  model, no session. **Not yet proven: that pi accepts the wake.** `scripts/live-test.mjs` is written
  for that — drive a real pi over RPC, settle it, spool a message, watch for a turn with no prompt
  behind it — and has not been run, because it spawns a session and costs a model call.
- **M3 — a real provider.** One adapter against a live mailbox, with OAuth2 token storage, reconnect
  and catch-up after downtime. The first live account is Andrei's, connected by him.
- **M4 — catch-up reporting.** What the agent is told after downtime: the newest *k* messages and
  how many were skipped. Today, turning on a watch with a backlog delivers every message in it.
- **M5 — always-on deployment.** The fetcher as a supervised process (detached from a session, or a
  scheduled task on Windows), so tracking genuinely is unconditional. A hosted agent (RPC/SDK) stays
  open for the case where nobody has a session open at all.

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
