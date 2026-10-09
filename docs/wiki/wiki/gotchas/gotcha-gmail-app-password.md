---
title: "A passkey-only Gmail account refuses app passwords"
type: gotcha
topic: gotchas
summary: "Gmail can refuse myaccount.google.com/apppasswords with the setting you are looking for is not available for your account even with 2-Step Verification properly on and a phone number registered, so the cause is not reliably diagnosable from outside. The consequence is what matters: that account cannot be read by this package, and the way out is a mailbox from a host that sells IMAP, not another attempt at Google."
tags: [gmail, app-password, 2fa, passkey, setup, gotcha]
updated: 2026-10-09
sources: [https://mailbox-mcp.com/guides/gmail-app-password-not-available/, https://support.google.com/accounts/answer/185833, https://support.google.com/cloud/answer/7454865, https://developers.google.com/apps-script/guides/services/quotas, raw/sessions/2026-10-09-session-2026-10-09-080352.md]
files: [C:/Coding/pi-email-listener/src/setup.ts]
claims:
  - id: c1
    text: "When Gmail answers myaccount.google.com/apppasswords with 'the setting you are looking for is not available for your account', that is Google declining to offer an app password for that account, and the cause is not reliably diagnosable from outside. The first thing to try is a second step other than a passkey or security key, since a passkey-only account is reported to be refused even with 2-Step Verification on — but that is not the whole story: an account with both a phone number and a passkey still got the same refusal on 2026-10-09, so the passkey explanation covers some cases and not all. What is certain is the consequence: a Gmail account in that state cannot be read by this package, and no amount of enabling 2-Step Verification from the user side is guaranteed to change it."
    status: verified
    support: 0.75
    evidence: ["user: Andrei Li, 2026-10-09 — 'When i go to the apppasswords link on my new agent account that i just made, i get The setting you are looking for is not available for your account.'", "user: Andrei Li, 2026-10-09 — 'I have a phone number as well as a passkey setup for this email and am still getting the error i sent above.' — which refutes the passkey-only explanation for this account", "source: mailbox-mcp.com guide — 'Google says the setting you are looking for is not available for your account when your only second step is a passkey or a security key' (true for some accounts, not this one)", "source: support.google.com/accounts/answer/185833 — app passwords require 2-Step Verification, which is necessary but evidently not sufficient", "not checked: whether the account is a Workspace (custom domain) account, where an admin policy also removes app passwords, or whether Google has stopped offering them for accounts created recently"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "The setup wizard names this cause when its own login check fails, in order: 2-Step Verification off, the ordinary password used instead of an app password, or a passkey-only second step. The last one matters because the person who hits it has usually just been told by Google that the setting does not exist for them, which sends them looking for an account problem rather than a second-factor one."
    status: verified
    support: 0.85
    evidence: ["file: src/setup.ts — runSetup()'s verification failure notice lists the three causes in that order", "command: npm run setup-check → 'a failed login writes no config at all' still passes with the longer notice"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c3
    text: "Google documents no verification exemption for Apps Script: a new script that requests access to consumer data may show the 'unverified app' screen before the consent flow. For consumer accounts Apps Script allows 20,000 email reads a day, and Google states that all quotas are subject to elimination, reduction or change at any time without notice."
    status: verified
    support: 0.8
    evidence: ["source: support.google.com/cloud/answer/7454865 — 'If a new Apps Script script requests OAuth access to data that belongs to consumers or users in other domains, the \"unverified app\" screen might display before the OAuth consent flow'", "source: developers.google.com Apps Script quotas — 'Email read/write (excluding send): 20,000 / day… All quotas are subject to elimination, reduction, or change at any time, without notice'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## What to do

1. Sign in as the **agent** account. That page only ever shows app passwords for the account the browser is
   currently signed into, so with several accounts open check the account switcher first — a page belonging
   to the wrong account says the same thing.
2. Under <https://myaccount.google.com/security> → **2-Step Verification**, look at the second steps. A
   passkey or security key alone is worth replacing with **Authenticator** or a **phone number**.
3. If it still refuses with 2-Step Verification properly on, stop. There is no known fix from the user side,
   and the useful answer is the next section rather than more attempts.

## If Google will not offer one at all

The escape that costs nothing to build:

- **Give the agent a mailbox somewhere else.** The package reads any IMAP host with a password, so there is
  nothing to implement: `/email-setup` → "A mailbox I already have (IMAP)" asks for the server and the
  address. An agent address on a domain of your own is also a nicer thing to hand a client than a gmail.com
  address.

The one that looks free and is not:

- **The Gmail API.** A Google Cloud project and OAuth client need no tenant and no administrator, so it is
  genuinely self-service — but an app whose consent screen is in Google's "Testing" publishing status is
  issued a refresh token that expires in **seven days** (Google's own OAuth documentation), which suits a
  weekend experiment and not an always-on service. Leaving testing means Google's verification review for
  Gmail scopes. Correct as an experiment, wrong as the front door.
- **The user's own Apps Script.** A script copied into the agent's account can read Gmail and answer a
  web-app URL, with no app password and no Cloud project, and consumer quotas are ample for polling
  ([c3](#c3)). But Google gives Apps Script no verification exemption, so the person clicks through an
  "unverified app" warning, then deploys and pastes a URL. A fallback for someone who must stay on
  Gmail, not a front door.

And one that needs no Google account at all: an inbox the package creates itself, read over IMAP with
its API key — see [AgentMail's agent sign-up](../architecture/agentmail-agent-inbox.md).
