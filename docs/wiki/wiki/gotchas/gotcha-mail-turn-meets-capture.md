---
title: "A mail turn meets wiki capture"
type: gotcha
topic: gotchas
summary: "A message delivered by a wake is read by the agent, so its text is in the transcript — and wiki capture snapshots the transcript. A session watching mail therefore feeds third-party mail into whichever wiki captures that session, including this one, unless capture is off for it. The extension says so when watching starts."
tags: [gotcha, wiki, capture, email, privacy, unattended]
updated: 2026-10-09
sources: [home: raw/sessions/2026-10-09-session-2026-10-09-061532.md]
files: [C:/Coding/pi-email-listener/src/extension.ts, C:/Coding/pi-email-listener/docs/PLAN.md]
claims:
  - id: c1
    text: "Wiki capture copies the session transcript into the wiki, and a mail-triggered turn puts a stranger's message into that transcript the moment the agent reads it — so a session watching mail can write external correspondence into this project's wiki with nobody in the loop. The mitigation chosen is a loud notice rather than a hard block: starting a watch announces that capture must be off while it is on, and the user decides."
    status: verified
    support: 0.8
    evidence: ["file: src/extension.ts — CAPTURE_NOTICE is sent with notify(…, 'warning') the moment /email-watch starts, and asserted in scripts/load-check.ts ('ok the command warns that capture must be off')", "home wiki: decisions/decision-secret-hygiene-in-capture.md — c1 verifies that capture snapshots the transcript into raw/sessions/ and c2 records that automatic mail wakes make that unattended", "config: C:/Users/liand/.pi/agent/jev-wiki.json has capture.cadence 'task' with no per-settle flag set on this machine, so the effective cadence is the thing to check before watching mail here"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## Why a notice and not a guard

Blocking watching outright when capture is on would refuse the feature because of a setting about a
different feature. The notice puts the decision where the knowledge is: the person starting the
watch knows whether the session captures, and the transcript they are about to open is their own.

## What to check before watching mail in a session

- Whether that session's wiki captures on settle or on a cadence, and whether it writes here.
- Whether the messages being watched are the kind that may live in a wiki at all. A client mailbox
  and a personal mailbox fail that test for different reasons.

Related: the first live account is Andrei's personal mailbox, used for testing only, and its contents
are not to be read or ingested — see [the decisions page](../decisions/decision-no-gate-and-pointer.md).
