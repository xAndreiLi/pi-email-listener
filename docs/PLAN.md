# pi-email-listener — design plan

Status: **proposal, not agreed.** Nothing here runs yet. The decisions at the bottom are open and
are what this document is asking for; everything above them is a recommendation.

---

## 1. What it is

The ears. Pi watches a mailbox and wakes the agent when a message deserves attention, handing over
**a pointer to the message**, never a summary of it. The agent opens the message itself.

The gap it closes: mail reaches an agent today only when a human copies it there. The agent cannot
notice anything on its own — the human *is* the transport layer between the inbox and the agent.
This package takes the human off that path for **awareness** and leaves them on it for **judgement
and replies**.

## 2. Who it is for, and what "a better grasp of the ecosystem" means concretely

A project manager's ecosystem *is* a mailbox: clients, contractors, vendors, colleagues, and
automated systems, carrying deadlines, scope changes, blockers, invoices and "can you just…". None of
it exists for the agent unless someone pastes it in.

Three separate jobs, in increasing ambition:

1. **Wake on arrival** — "something arrived that you should look at now." This is the package.
2. **Catch-up on demand** — "what happened in the last three hours?" answered from the mailbox
   instead of the human scrolling it. Falls out of (1) almost free once the messages are on disk.
3. **Continuity** — the agent keeps project state current from mail: threads it is tracking,
   promises made, dates, who is who. This is what turns a notifier into a grasp of the ecosystem,
   and it is a different design (it writes somewhere — the agent's own notes or wiki), so it is
   deliberately **not in v1**.

## 3. Architecture — the decision that shapes everything

Where does the mailbox connection live, and how does the wake reach an agent?

**Verified constraint.** Pi starts a turn in a session through two extension-context calls,
`pi.sendMessage(…, { triggerTurn: true })` and `pi.sendUserMessage(…)`. Both are only callable from
an extension *inside* that session. There is no external channel into a running interactive session:
RPC mode is a client controlling a pi *it started* (JSONL on the child's stdin/stdout), not a way to
attach to somebody else's open pi. So a separate listener process cannot knock on the door of the
session already open in a terminal. Something has to give:

### A. In-session listener (the extension owns the mailbox)

`session_start` starts the watcher; messages arrive; the gate decides; the extension wakes its own
session.

- Precedent: `pi-job-listener` proved this path live on pi 1.1.0 — agent settles, then
  `sendMessage({triggerTurn: true})` from a timer produces a real turn — including the
  lifecycle rules (nothing long-lived in the factory; idempotent `session_shutdown` teardown).
- Cost: mail is only watched while pi runs. Downtime is not loss — mail is durable server-side — it
  becomes catch-up on next start.
- Strength: one process, no IPC, no daemon to supervise or secure, credentials live with the
  session's own config. **This is the smallest thing that fully does the job.**

### B. The listener owns the session (daemon spawns or hosts pi)

An always-on process holds the mailbox and either starts pi with `--mode rpc` and feeds prompts to
its stdin, or hosts a pi session in-process through the SDK.

- Strength: works headless and always-on — a server, a scheduled task, a machine nobody is sitting
  at. The session lifecycle becomes the daemon's problem, so "the agent is always listening" is
  actually true.
- Cost: we then own session lifecycle — restarts, model and cost config, crash loops, log rotation,
  duplicate instances, and where the session's transcript lives. And the session we wake is *ours*,
  not the one the human has open, so they must go and look at it. That is a worse experience for the
  "wake me where I am" case, and a better one for "an agent is on duty".
- B is what a hosted version of this looks like. It is also the only shape that works with no pi
  open at all.

### C. A spool between them

A dumb always-on fetcher writes every message to a spool directory (raw `.eml` + a JSONL index); the
in-session extension tails the spool and wakes. The fetcher has no dependency on pi at all.

- Strength: the fragile part — OAuth, token refresh, IMAP IDLE reconnects, backoff — runs
  continuously and survives pi restarts, while the wake path stays the simple in-session one. The
  fetcher becomes a plain Node program that is easy to test without pi, and the spool doubles as the
  audit log and the gate's training data.
- Cost: two processes and a spool format to keep honest, plus "who starts the fetcher" on Windows.

**Recommendation: A now, built with C's seam.** Write the mailbox layer so its only output is the
spool — files, not callbacks into pi — and have A read that spool. Then C is "run the same fetcher
outside a session", B stays available for a hosted agent, and neither is a rewrite. One process for
v1, without painting the design into a corner.

## 4. The wake gate — the actual product problem

A mailbox is mostly noise. The package's value is not waking the agent for noise, and *never*
failing to wake it for something that matters. Mirroring the job-listener decision (terminal events
always wake; only ambiguous middle output goes to a gate):

- **Always wake** — direct (To:, not Cc:) from a known or priority sender; a reply in a thread the
  agent is tracking; a question addressed to the human by a human.
- **Never wake** — bulk and marketing senders, no-reply addresses, calendar acceptances, automated
  status mail, cc-only from a non-priority sender. Every suppression rule is visible and editable by
  the user, never a hidden heuristic.
- **Ambiguous** — unknown sender, forwarded thread, a newsletter from a real person, a reply-all
  storm. Only this residue is worth a gate.
- **Batch, don't drip** — job-listener measured 11 job completions collapsing into 4 wake turns
  (batches of 6, 1, 2, 2). A mailbox is far noisier: wake at most once per window *N* while idle,
  queue while the agent is busy, and collapse batches over ~3 messages into one line each.
- **Catch-up is bounded** — after downtime, do not replay 400 arrivals. Deliver the newest *k* that
  pass the gate plus one line saying how many were skipped; the agent pulls the rest with a tool if
  it cares.
- **No model on the arrival path in v1** — a paid call per message is a bill that scales with
  somebody else's spam, and the rules above cover most real mail. A model is for the ambiguous
  residue, and only after real labelled examples exist (below).

**Fail-safe direction differs from job-listener.** There, a gate mistake costs a missed optional
wake. Here, a missed wake can be an unanswered client and lost work, so the default bias is
**louder**: when in doubt, wake with the pointer and let the agent judge. A wasted turn is cheaper
than a silent inbox.

**The pipeline comes first.** Same rule as job-listener: every arrival, every gate answer, and what
happened next is appended to the spool as a byproduct of normal use. Gate decisions are logged *with
their reason* ("woke: direct mail, sender on priority list") because that reason is how the rules get
corrected. A few hundred real arrivals get labelled from that log before any model is trained or
trusted.

## 5. What the wake carries

A pointer, consistent with the existing decision, containing nothing that will be wrong later:

```
[email] 1 new · 14:32 · Dana Whitfield <dana@…> → you
Subject: Re: Q3 rollout — invoice
Thread: 3 messages, last from you 2 days ago
Files: .mail/acct-1/2026-10-09T14-32-07-4f2a.eml  (+1 attachment: rollout.xlsx, 240 KB)
Why: direct to you, sender on priority list
```

- **No body in the wake.** The agent reads the message file with its normal tools. Consistency with
  the job-listener decision, and the transcript cost of mail bodies is permanent.
- The subjects line carries the triage signal; the envelope carries what is needed to judge without
  opening anything: who (and whether you were only cc'd), thread length and who spoke last,
  attachment *names* and sizes, arrival time, and the gate's one-line reason.
- The reason is for calibration, not decoration.

## 6. Providers — what "Outlook or any other provider" really costs

The protocol layer is the least interesting part of this and the most likely to eat the schedule.
What is actually true:

- **Microsoft (Outlook.com, M365):** basic authentication for IMAP/POP/SMTP is switched off in
  Exchange Online, so there is no app-password shortcut. Access means registering an app in Entra
  and doing OAuth2. For a personal or consumer Outlook.com mailbox that is a one-time setup the user
  does themselves; in a **corporate tenant the mailbox permission commonly needs admin consent** —
  i.e. asking the client's IT department. That is an adoption wall, and a product decision rather
  than a technical one.
- **Reading without a public endpoint:** Graph delta queries (`/me/messages/delta`) poll cheaply and
  return only what changed; no inbound HTTPS, no subscription to renew. Graph *change notifications*
  are push but need a public HTTPS endpoint, lifecycle notifications, and renewal every few days —
  not v1.
- **IMAP (everything else):** one adapter covers Gmail, Fastmail, Proton Bridge, most providers and
  self-hosted; Gmail also needs OAuth2 (app passwords are being squeezed). IMAP IDLE makes arrival
  near-push with no polling at all.
- **The only abstraction worth having** is two methods: `listNew(since) → Envelope[]` and
  `fetch(id) → raw message`. Two implementations maximum before v1 ships; everything above that line
  stays provider-agnostic.

**Recommendation:** build one adapter against the mailbox that actually gets used daily, and draw the
interface from that single implementation rather than from imagining the second. Which mailbox that
is — and whether it is personal mail or a client's — is decision **D2**, and it gates M1.

## 7. Trust: mail is the first genuinely untrusted input this agent gets

Job output comes from the agent's own commands. Mail is written by strangers, and it arrives *inside
the agent's context* while the agent has shell and file access. This hazard did not exist in
job-listener and deserves decisions rather than good intentions:

- Mail is delivered as an extension message, explicitly framed as untrusted third-party text — never
  as a user instruction, never as a system message.
- **Nothing automatic on the far side of a message:** no auto-reply, no opening attachments, no
  fetching links, no running anything a message suggests. v1 has no send path at all.
- A message that asks the agent to *do* something is precisely the message to bring to the human
  first. This is enforceable rather than aspirational: `pi.on("tool_call", …)` fires before a tool
  executes and can return `{ block: true, reason }`, so a mail-triggered turn can refuse
  `bash`/`edit`/`write` until the human has seen the message (decision **D5**).
- The spool holds plaintext client mail and possibly a refresh token: gitignored, outside any synced
  folder, with a retention decision of its own. Tokens belong in the OS keychain or an agent-dir file
  with restrictive permissions — never in the repo, never in the transcript.
- **Wiki hazard.** Sessions running this package will have client mail in context, and pi's wiki
  capture fires automatically on settle. Unattended capture of a mail-triggered turn could write a
  client's message into a wiki page. This project's capture configuration must exclude mail content,
  and "never ingest mail bodies" belongs written down as a rule, not remembered.
- Every fetch, gate decision and wake is logged, so "what did my agent look at?" has an answer.

## 8. What the agent gets to call

The lazy answer for v1, because the wake already hands over file paths and `read` exists:

- **v1: no new tools.** If the pointer plus the spool path is enough for the agent to be competent,
  that is the whole tool surface.
- Then, when "what else came in?" stops being answerable by listing a directory: one small tool,
  `email_recent` / `email_search`.
- Later, deliberately: `email_read` (pretty-printed, with thread), `email_archive`/`email_label`
  (acting on the mailbox changes the human's mailbox — its own decision), `email_draft` (never
  auto-send).
- Every registered tool is context the model sees on every request. The mailbox should not be
  visible to the model by default: **the listener is the interface, not a mail client bolted into the
  agent.**

## 9. Milestones

Each one proves something, and each is testable without the next.

- **M0 — scaffold (this commit).** Repo, metadata, plan. Nothing runs.
- **M1 — mailbox to spool, no agent.** One adapter; poll or IDLE; each new message becomes
  `.eml` + a JSONL index line under the account's spool. Verified by a plain `jiti`/`node` script
  against the real mailbox and against fixture mail in tests. *Proves:* we can read mail reliably,
  reconnect after a drop, and survive token expiry — with zero pi involvement.
- **M2 — the wake, end to end.** The extension: `session_start` starts the watcher, spool → rules
  gate → batched pointer wake via `sendMessage(…, {triggerTurn: true})`, idempotent teardown on
  `session_shutdown`. Tested at layer 1 (stub `pi` API, offline fixtures) and layer 2 (RPC drive of a
  real pi that settles and is then woken) per the wiki's pi-extension testing procedure. *Proves:*
  the wake is real, batched, and silent when nothing matters.
- **M3 — catch-up and the log.** Bounded catch-up after downtime; gate decisions logged with
  reasons; `email_recent`/`email_search` only if M2 showed the gap.
- **M4 — calibration.** Label a few hundred real arrivals from the log; only then tune rules or
  consider a local gate model (Laya precedent). *Proves:* the gate earns its place on real mail
  rather than on imagination.
- **M5 — deployment shapes.** The fetcher as a standalone always-on process (C) if mail-during-no-pi
  matters — which is also the road to a hosted agent (B).

Continuity (§2 job 3) is deliberately not a milestone here; it belongs to the notes/wiki side, once
arrivals are flowing.

## 10. Risks that could sink it

- **OAuth friction is the adoption killer.** Any path that begins "register an app in Entra and ask
  IT" loses a project manager in the first five minutes. Consumer mailboxes (Outlook.com, Gmail,
  generic IMAP) are what make this installable by one person; corporate M365 is what makes it
  sellable to a company, and it is a longer road with a gatekeeper on it.
- **Volume poisons the transcript.** A mailbox that cc's you on 200 threads a day will fill the
  transcript and teach both human and agent to ignore wakes. Batching and suppression rules are
  load-bearing, not polish.
- **Prompt injection** (§7) — the class of bug that ends with an agent doing something the human
  never asked for, on the word of a stranger's email.
- **"You have mail" is not progress.** Waking the agent only matters if it can say what a message
  *means for what we were doing*. Otherwise the human still reads the mailbox and the agent is
  overhead. That is where the value lives, and §2 job 3 is the thing to design after v1.

## 11. Open decisions

Each has a recommendation; "go with the recommendations" is a complete answer.

**D1 — Architecture.** (a) In-session listener; (b) listener owns the session (daemon + RPC/SDK);
(c) always-on fetcher plus in-session tailer.
→ **Recommended: (a) now, built with (c)'s seam**, (b) kept for a hosted agent later.

**D2 — The first mailbox.** Which address, whose, and is it personal or a client's? Personal/consumer
mail gives the fastest loop with no gatekeeper; a client's corporate M365 is the real target but adds
Entra registration and possibly their IT.
→ **Recommendation: start with the mailbox used most, if it is not a corporate tenant** — the
feedback loop matters more than the target market at M1.

**D3 — Wake policy.** Strict priority-list rules; wake-on-any-direct-mail; or a model gate from the
start.
→ **Recommended: rules first, biased loud, every decision logged with its reason**, model only for
the ambiguous residue once real examples exist.

**D4 — Wake payload.** Pointer only, or pointer plus a short body snippet?
→ **Recommended: pointer only** — subject and envelope carry the triage signal, the body is one
`read` away, and transcript cost is permanent.

**D5 — Trust posture for mail-triggered turns.** (a) Treat mail like any other input; (b) frame it as
untrusted but leave tools available; (c) **quarantine** — frame it as untrusted *and* block
`bash`/`edit`/`write` via `tool_call` until the human has seen the message.
→ **Recommended: (c) for messages with attachments, links, or instructions; (b) otherwise.**
Slightly annoying, and the failure it prevents is the one that costs a client.

**D6 — Tool surface.** No tools in v1, or a read/list tool from the start?
→ **Recommended: none in v1**, add when M2 shows the gap.

**D7 — Configuration and state.** Agent-directory JSON with environment overrides (the job-listener
pattern), spool under `getAgentDir()/mail`, credentials in the keychain or an agent-dir file.
→ **Recommended: yes, mirroring the sibling package.**

One more question that is not a checkbox: **product or personal tool first?** A personal tool only has
to work on one mailbox and can stay a local package; a product has to survive other people's
tenants, keychains, and IT departments, and that difference should be visible in how much of M1 is
spent on provider abstraction.
