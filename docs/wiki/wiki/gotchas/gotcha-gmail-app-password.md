---
title: "A passkey-only Gmail account refuses app passwords"
type: gotcha
topic: gotchas
summary: "A brand new Gmail account can have 2-Step Verification switched on and still refuse myaccount.google.com/apppasswords with 'the setting you are looking for is not available for your account'. The cause is which second factor it has: Google steers new accounts into passkeys, and app passwords are not offered when a passkey or security key is the only second step. Adding a phone number or an authenticator app fixes it."
tags: [gmail, app-password, 2fa, passkey, setup, gotcha]
updated: 2026-10-09
sources: [https://mailbox-mcp.com/guides/gmail-app-password-not-available/, https://support.google.com/accounts/answer/185833]
files: [C:/Coding/pi-email-listener/src/setup.ts]
claims:
  - id: c1
    text: "Gmail refuses app passwords when the account's only second step is a passkey or a security key, even though 2-Step Verification reports as on — the app-passwords page answers with 'the setting you are looking for is not available for your account', which reads like a policy refusal rather than a missing factor. Adding a phone number or an authenticator app as an additional second step makes the page work. Google's own help only states that app passwords require 2-Step Verification; the passkey condition comes from a secondary guide and is worth treating as the first thing to try rather than settled fact."
    status: verified
    support: 0.7
    evidence: ["user: Andrei Li, 2026-10-09 — hit exactly this on a freshly created agent Gmail: 'When i go to the apppasswords link on my new agent account that i just made, i get The setting you are looking for is not available for your account.'", "source: mailbox-mcp.com guide — 'The cause is almost always which second factor you set up rather than whether you set one up, and Google now steers new accounts straight into the version that does not qualify… Google says the setting you are looking for is not available for your account when your only second step is a passkey or a security key. Add a phone number or an authenticator app as a second [step]'", "source: support.google.com/accounts/answer/185833 — 'App passwords can only be used with accounts that have 2-Step Verification turned on'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "The setup wizard names this cause when its own login check fails, in order: 2-Step Verification off, the ordinary password used instead of an app password, or a passkey-only second step. The last one matters because the person who hits it has usually just been told by Google that the setting does not exist for them, which sends them looking for an account problem rather than a second-factor one."
    status: verified
    support: 0.85
    evidence: ["file: src/setup.ts — runSetup()'s verification failure notice lists the three causes in that order", "command: npm run setup-check → 'a failed login writes no config at all' still passes with the longer notice"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## What to do

1. Sign in as the **agent's** account — that page only ever shows app passwords for the account the
   browser is currently signed into.
2. Open <https://myaccount.google.com/security> → **2-Step Verification** and look at the second steps
   listed. A passkey or security key alone is the problem.
3. Add **Authenticator** or a **phone number**.
4. Reload <https://myaccount.google.com/apppasswords>.

## If Google will not offer one at all

Two ways out, and the first is faster:

- **Give the agent a mailbox somewhere else.** The package reads any IMAP host with a password, so
  nothing needs building: `/email-setup` → "A mailbox I already have (IMAP)" asks for the server and
  the address. Paid hosts that still do IMAP with app passwords are cheap, and an agent address on a
  domain of your own is a nicer thing to hand a client than a gmail.com address.
- **Read Gmail through its API instead of IMAP** — a Google Cloud project and an OAuth client, which
  an individual can create with no tenant and no administrator. The cost is that an app left in
  Google's "Testing" publishing status has refresh tokens that expire in about a week, which suits a
  weekend experiment and not an always-on service; leaving testing means Google's verification review
  for Gmail scopes. Worth checking the current rules before choosing it.
