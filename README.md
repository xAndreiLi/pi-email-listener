# pi-email-listener

**Status: design stage.** Nothing here runs yet. This repository currently holds the scaffold and the
plan — [`docs/PLAN.md`](docs/PLAN.md) — and no extension. The plan is not agreed either; its open
decisions are listed at the bottom of that file.

The ears. A [pi](https://pi.dev) package that watches a mailbox and wakes an agent when a message
deserves attention, handing over **a pointer to the message** — sender, subject, thread, file path —
never a summary of it. The agent reads the message itself.

Sibling to [pi-job-listener](https://github.com/xAndreiLi/pi-job-listener), which does the same for
long-running processes, and inherits its two rules: wake only when it matters, and deliver a pointer
rather than a digest.

## The idea in one paragraph

Mail reaches an agent today only when a human copies it there — the human *is* the transport layer
between their inbox and their agent. For a project manager that inbox is the ecosystem: clients,
contractors, deadlines, scope changes, blockers. This package takes the human off the transport path
for **awareness** and leaves them on it for **judgement and replies**. The agent notices what
arrived, wakes itself in the session the human is already sitting in, and can answer "what does this
mean for what we were doing?" instead of "you have mail".

## Install

Not installable yet — there is no extension in this repository. It becomes a loadable package at
milestone M2 in the plan.

## Licence

MIT
