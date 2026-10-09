---
title: "No gate, a pointer not a digest, and watching only when asked"
type: decision
topic: decisions
summary: "pi-email-listener turns the agent for every message — no relevance gate, no batching, no suppression rules — and the wake carries the sender, the subject and a file path rather than the body. Watching is opt-in per session through /email-watch. A message with a link or attachment turns the agent with bash, edit and write blocked until the turn ends."
tags: [decision, gate, wake-payload, opt-in, quarantine, email]
updated: 2026-10-09
sources: [home: raw/sessions/2026-10-09-session-2026-10-09-055057.md, home: raw/sessions/2026-10-09-session-2026-10-09-061532.md]
files: [C:/Coding/pi-email-listener/src/extension.ts, C:/Coding/pi-email-listener/src/wake.ts, C:/Coding/pi-email-listener/docs/PLAN.md]
claims:
  - id: c1
    text: "There is no relevance gate: every message that arrives turns the agent. The job-listener split (terminal events always wake, ambiguous ones judged by a model) was considered and rejected, along with priority-sender rules, bulk and no-reply suppression, and batching. The judgement behind it: a missed client message costs more than a wasted turn."
    status: user-stated
    support: 0.95
    evidence: ["user: Andrei Li, 2026-10-09 — \"The agent should always turn for every email, we dont need a gate.\"", "file: docs/PLAN.md — §4 records the rejection and its consequences: volume is the user's choice, and messages arriving mid-turn queue rather than interrupt"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "The wake is a pointer, not a digest: sender, subject, received time, account and the path of the spool file to read. The body is deliberately absent — it is one `read` away, and anything in the transcript is permanent. Andrei set the content as \"the subject line and sender\", leaving the rest to the implementation."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — \"The wake payload should just be the subject line and sender maybe. You can choose.\"", "file: src/wake.ts — pointer() composes exactly two lines: `[email] <name <address>> · <subject>` and `<receivedAt> · <account> · <absolute path>`", "command: npm run load-check → 'ok the pointer names the sender and the subject', 'ok the pointer does not carry the body'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c3
    text: "Watching is opt-in per session: the user sets the service up in the session that should be woken, with `/email-watch`, and the same command stops it. Nothing is turned by mail by surprise, and a session that should always be woken opts in through a setting rather than by being treated as armed by default."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — \"the process that actually turns the agent should require the user to set up this service through a pi session\"", "user: Andrei Li, 2026-10-09 — \"I like the idea of using a slash command yeah. Lets do /email-watch.\"", "file: src/extension.ts — registerCommand('email-watch') toggles the poll timer; PI_EMAIL_LISTENER_AUTOSTART is the always-on path and the RPC test's way in"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c4
    text: "The first live account is Andrei's personal Gmail mailbox, connected by him, and its contents are not to be read, explored or ingested: it is a test target. Development and verification run against fixtures, so nobody has to read his mail — the account is only attached when he supplies credentials himself and runs it."
    status: user-stated
    support: 0.95
    evidence: ["user: Andrei Li, 2026-10-09 — \"The first target can be my personal email, but there is some personal stuff in there so dont actually go through it, we can just use it for testing.\"", "user: Andrei Li, 2026-10-09 — \"My personal mailbox is gmail\" (the address is deliberately not recorded here)"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c5
    text: "Mail from a stranger arriving in a context that has shell access is treated as untrusted: a message carrying a link or an attachment turns the agent with `bash`, `edit` and `write` refused until that turn ends, and v1 has no send path at all. The safety recommendation was accepted as proposed."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — \"Yes i like the recommendation for safety here.\" (the recommendation: quarantine messages with links, attachments or instructions by blocking bash/edit/write until the human has seen them; frame as untrusted but leave tools available otherwise)", "file: docs/PLAN.md — §6"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## Why no gate, when the sibling package has one

`pi-job-listener` gates because its ambiguous question — is a running process's *middle output* worth
an interruption — is genuinely hard, and because a missed terminal event strands an agent on a job
that is already over. Mail is different in the direction that matters: the failure that hurts is
failing to surface a message. Rather than judge arrivals, this package turns the agent and lets it
judge, which is the same reasoning that made the pointer cheaper than a digest.

The cost is volume, and it is accepted rather than hidden: a mailbox receiving 200 messages a day
turns the agent 200 times. If that turns out to hurt, it is a decision for the user to make, not a
filter the package applies on their behalf.

## See also

- [Two halves joined by a spool](../architecture/architecture-spool-and-wake.md)
- [A mail turn meets wiki capture](../gotchas/gotcha-mail-turn-meets-capture.md)
- home wiki: `decisions/decision-secret-hygiene-in-capture.md` — capture snapshots the transcript
- home wiki: `decisions/decision-long-process-gate.md` — the sibling package's opposite answer
