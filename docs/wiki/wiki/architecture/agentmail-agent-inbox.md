---
title: "An inbox the package can create itself: AgentMail's agent sign-up"
type: architecture/layer
topic: architecture
summary: "AgentMail lets a program create an agent inbox with one unauthenticated POST — no human sign-up, card, domain, app password or OAuth — and the inbox is readable over IMAP with its API key as the password, so the existing imap source reads it unchanged (proven live 2026-10-09 with suruiling@agentmail.to, now configured on Andrei's machine). /email-setup offers it first: a name, and the agent has an address, with its Spam folder watched too. Without a human attached the inbox can receive but cannot send to anyone, which matches the no-send boundary. The price: a lost key cannot be recovered, a third party holds the mail, and inbound mail that fails authentication is dropped without a bounce. Arrival of a real message is still to be proven."
tags: [architecture, intake, agentmail, imap, setup, rented-address]
updated: 2026-10-09
sources:
  [
    "https://docs.agentmail.to/api-reference/agent/sign-up.md",
    "https://docs.agentmail.to/agent-onboarding.md",
    "https://docs.agentmail.to/imap-smtp.md",
    "https://docs.agentmail.to/permissions.md",
    "https://docs.agentmail.to/knowledge-base/claiming-agent-inbox.md",
    "https://docs.agentmail.to/knowledge-base/inbound-emails-missing.md",
    "https://docs.agentmail.to/spam-virus-detection.md",
    "https://docs.agentmail.to/message-expiry.md",
    "https://www.agentmail.to/pricing",
    "https://docs.agentmail.to/faq.md",
    "https://docs.agentmail.to/api-reference/organizations/get.md",
    "raw/sessions/2026-10-09-session-2026-10-09-080256.md",
    "raw/sessions/2026-10-09-session-2026-10-09-080352.md",
    "raw/sessions/2026-10-09-session-2026-10-09-082544.md",
    "raw/sessions/2026-10-09-session-2026-10-09-084215.md",
  ]
files: [C:/Coding/pi-email-listener/src/imap.ts, C:/Coding/pi-email-listener/src/setup.ts, C:/Coding/pi-email-listener/scripts/setup-check.ts]
claims:
  - id: c1
    text: "AgentMail lets a program create a receive-only agent inbox with one unauthenticated call — POST https://api.agentmail.to/v0/agent/sign-up with a `username` returns an `inbox_id` (`<username>@agentmail.to`) and an `api_key` — and that inbox is readable over IMAP at imap.agentmail.to:993 with the inbox address as the user and the API key as the password. This package's existing imap source could therefore read it with no new adapter, and setup would need no human sign-up, card, domain, app password or OAuth. Without a human email the inbox cannot send to anyone, which matches the no-send boundary, but a lost key cannot be recovered. Unverified organizations are denied only api_key_create, list entries, pods and app_connect — reading is not restricted. Free tier: no card, 3 inboxes, 3,000 emails/month, 3 GB; the 24-hour message expiry is an opt-in enterprise policy, off by default. An unclaimed agent organization is smaller than that: it reported inbox_limit 1 and domain_limit 0, and a claim moves it onto the Free plan. Sign-up and the IMAP login were run live on 2026-10-09 (c3)."
    status: verified
    support: 0.8
    evidence: ["source: docs.agentmail.to API reference 'Sign Up' — 'POST https://api.agentmail.to/v0/agent/sign-up… human_email is optional. Without it, the inbox can receive email but cannot send to anyone… There is also no way to recover the API key, so store it durably'", "source: docs.agentmail.to 'IMAP & SMTP' — 'Host imap.agentmail.to · Port 993 · Username Your inbox email · Password Your API key · SSL/TLS Required'; 'The IMAP server supports the IDLE extension'", "source: docs.agentmail.to 'Permissions' — 'An organization created through agent sign-up is unverified until it completes POST /v0/agent/verify. Until then, these permissions are denied for every key at every scope: api_key_create, list_entry_create and list_entry_delete, pod_create, pod_update, and pod_delete, app_connect'", "source: agentmail.to/pricing — 'Free — $0/month… No credit card required · 3 inboxes · 3,000 emails/month · 100 emails/day · 3 GB storage'", "source: docs.agentmail.to 'Message expiry' — 'Message expiry is off by default.'", "command: GET https://api.agentmail.to/v0/organizations with the SuRuiling key → 'organization: 200 {\"inbox_count\":1,\"inbox_limit\":1,\"domain_limit\":0}'", "source: docs.agentmail.to 'How do I claim my agent's inbox?' — 'Before the claim: Sign-up limits for unverified agents — After the claim: Free plan'", "not checked: whether received mail counts toward the monthly figure, which the rate-limits page frames as sending"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "AgentMail drops inbound mail when SPF or DKIM explicitly fails, or DMARC fails (unless the sender's DMARC policy is none), and it does so without a bounce to the sender, whose server may still report successful delivery. Mail with no authentication headers is delivered with an `unauthenticated` label. Mail judged spam is stored but excluded from API listings by default, and over IMAP it sits in a separate Spam folder rather than INBOX."
    status: verified
    support: 0.8
    evidence: ["source: docs.agentmail.to 'Why are my emails not showing up?' — 'Neither SPF nor DKIM returns a FAIL verdict. DMARC does not return FAIL (unless the sender's DMARC policy is none)… Emails dropped due to failed authentication are rejected without a bounce-back to the sender. The sender's mail server may still report successful delivery'", "source: docs.agentmail.to 'Spam & Virus Detection' — 'Emails identified as spam are still stored in your inbox so you never lose a message that might be a false positive. However, they are excluded from API results by default'", "source: docs.agentmail.to 'IMAP & SMTP' — 'IMAP exposes the following folders: INBOX, Sent, Trash, and Spam.'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c3
    text: "Live on 2026-10-09, AgentMail's agent sign-up worked as documented, and the package's existing IMAP source read the result unchanged. Signing up the username SuRuiling returned the inbox suruiling@agentmail.to (AgentMail lowercased it) with a US-region key (prefix am_us_, so the inbox is claimable). verifyImap logged in at imap.agentmail.to with the inbox address and the key. A first pass on the empty INBOX stored nothing, raised no error and wrote the cursor {uidValidity 1, lastUid 0}, so the next pass resumes from UID 1. AgentMail sends no welcome message, so the arrival of real mail is still unproven."
    status: verified
    support: 0.9
    evidence: ["command: jiti agentmail-signup.ts (POST /v0/agent/sign-up {username: SuRuiling}, then saveAccount and verifyImap) → 'inbox: suruiling@agentmail.to · account: suruiling · key: in the config only (not shown) · prefix am_us_…' and 'IMAP login works: 0 message(s) in INBOX'", "command: jiti agentmail-pass.ts (syncAccount for the suruiling account only) → 'pass ok, stored: 0 · cursor: {\"uidValidity\":\"1\",\"lastUid\":0,\"account\":\"suruiling\",\"mailbox\":\"INBOX\"}'", "source: docs.agentmail.to claim page — 'Claiming is available for inboxes in the US region, whose keys start with am_us_.'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c4
    text: "AgentMail's sending limits depend on the inbox's state. With no human attached an inbox cannot send at all; with a human attached but unverified it can send only to that human; once claimed in the Console, sending opens with a new-account limit of at most 3 distinct recipients in the first hour, 5 in the first day and 10 in the first week. The pricing page lists the free plan at 3,000 emails a month and 100 a day, and marks the 'No Sent via AgentMail footer' feature and custom domains as unavailable on it. SMTP allows 50 recipients and 10 MB per message. AgentMail's FAQ and rate-limits page do not say whether received mail counts toward the monthly and daily figures."
    status: verified
    support: 0.75
    evidence: ["source: docs.agentmail.to 'Agent Onboarding' — 'Unverified accounts can only send email to the attached human… An account with no human attached cannot send at all until one is attached with POST /v0/agent/human.'", "source: docs.agentmail.to claim page — 'Sending is unlocked, with a limit for new accounts: at most 3 distinct recipients in the first hour, 5 in the first day, and 10 in the first week.'", "source: agentmail.to/pricing — 'Free — $0/month… 3,000 emails/month · 100 emails/day'; feature table 'No \"Sent via AgentMail\" footer: Free ✗' and 'Custom Domains: Free ✗'", "source: docs.agentmail.to 'IMAP & SMTP' — 'Max recipients: 50 per email · Max message size: 10MB'", "source: docs.agentmail.to FAQ — 'The free tier includes 3 inboxes and 3,000 emails per month, no credit card required.' (nothing on received mail)"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c5
    text: "At Andrei's request, the inbox suruiling@agentmail.to was signed up on 2026-10-09 for his machine and written into ~/.pi/agent/pi-email-listener.json as the imap account `suruiling` (the machine as it now stands is c7). No human email was given at sign-up, so by c1 the inbox is receive-only and its key cannot be recovered. The setup kept the key out of the transcript and left the config as its only copy."
    status: verified
    support: 0.8
    evidence: ["user: Andrei Li, 2026-10-09 — 'You can run tests and set up an agentmail for my machine. try to use the name SuRuiling.'", "command: jiti agentmail-pass.ts → 'accounts in config: outlook, suruiling'", "command: ls ~/.pi/agent | grep agentmail-signup → 'rescue copy: removed' (the sign-up response was written to disk first, then deleted once the config held the key)"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c6
    text: "/email-setup now offers 'Give the agent its own address (instant, no sign-up)' first. It signs up at AgentMail with no human email, so the inbox is receive-only, and writes two imap accounts: `<name>` on INBOX and `<name>-spam` on Spam, both with the key as the password. Unlike the Gmail and IMAP routes, it writes before it verifies, because the key cannot be fetched again. If the config cannot be written, the key goes to `<config>.<name>.agentmail.json` and the user is told where, without the key being shown. It then checks both folders; a failed check keeps the accounts, since the fetcher retries every pass. An existing AgentMail address is named, with a question, before a second is made, and a refused name is reported in AgentMail's own words before another is asked for."
    status: verified
    support: 0.85
    evidence: ["file: src/setup.ts — giveItAnAddress(): 'Unlike the other routes it writes before it verifies, because the key it hands back cannot be fetched again — a check that failed first would lose the inbox'; the spam account is `{ ...account, name: `${name}-spam`, folder: \"Spam\" }`; the rescue file is `${path}.${name}.agentmail.json`", "command: npm run setup-check → 'ok the new address is the first thing offered', 'ok a refused name is reported in AgentMail's words, and another is asked for', 'ok its Spam folder is watched as well', 'ok both folders are checked, and only once the key is safely written', 'ok the key never appears in anything said on screen', 'ok a failed first login keeps the account, because the key cannot be fetched again', 'ok a config that cannot be written does not lose the key', 'ok the sign-up sends the name and no human email, so the inbox is receive-only'", "command: npm run test:all → 'exit: 0 · ok: 140 · suites passed: 7'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c7
    text: "Andrei's machine as prepared for testing on 2026-10-09: the config holds `suruiling` (INBOX) and `suruiling-spam` (Spam), the same key in both; the `outlook` Graph account and its empty spool folder are gone; both folders log in at imap.agentmail.to, where the spam folder is named `Spam`; and there is no `service` setting, so the background fetcher runs only once it is started."
    status: verified
    support: 0.8
    evidence: ["command: jiti ready-suruiling.ts → 'accounts now: suruiling (INBOX), suruiling-spam (Spam) · service: null', 'key held by both: true', 'mail dir: suruiling', 'login ok · INBOX: 0 message(s)', 'login ok · Spam: 0 message(s)'", "user: Andrei Li, 2026-10-09 — 'remove outlook from the picture, and just get the system ready for testing. You dont need to start testing yet.'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## Why it matters

Every route in `docs/INTAKE.md` that is easy for a project manager rents its address. This one rents it
too, but from a provider whose product *is* an address for an agent. It is also the only route found
where the package itself can create the mailbox: no human sign-up, no card, no domain, no app password
and no OAuth. Measured against INTAKE's three criteria, it is the first route that is easy for a new
user without giving up "generalizable" or "provider agnostic", because senders still just cc or forward
from whatever they use.

## On Andrei's machine

`suruiling@agentmail.to` is configured as `suruiling` and `suruiling-spam` ([c7](#c7)), and the IMAP
login and a first pass work ([c3](#c3)). The background service is off until someone starts it. The sign-up response was written to disk the moment it arrived, saved
into the config through `saveAccount`, checked there, and then the rescue copy was deleted. So **the
config file is the only copy of the key**. Claiming the inbox at <https://console.agentmail.to/claim>
makes it recoverable, but it also unlocks sending ([c4](#c4)).

## Sending, for when it comes up

The package has no send path by decision (decisions page, c13). Receive-only also means AgentMail
itself refuses to send, which matters because the agent can read its own config. If sending is ever
wanted, the limits are those in [c4](#c4): a slow ramp after a claim, and on the free plan sent mail
shows AgentMail's branding.

## What /email-setup does

```
/email-setup → "Give the agent its own address" → a name → done
```

The wizard signs up ([c1](#c1)), writes two ordinary `imap` accounts, checks the login, and offers to
keep the fetcher running ([c6](#c6)). The IMAP source, the spool and the wake are unchanged; the only
new code is the sign-up call and the order of writing before checking.

## What it costs

- **A rented address.** AgentMail's terms can change like anyone's. The category is crowded, so
  switching vendors is possible, but on the free tier the address is `@agentmail.to`, so a switch
  changes the address correspondents use. A custom domain is a paid-plan feature (Developer, per the
  pricing page).
- **A third party holds the mail.** That is true of every hosted route (Gmail, ForwardEmail,
  Cloudflare in transit), but here the provider stores it. Whether a project manager's employer allows
  client mail there is a question for the user, not the package.
- **Recoverability against a provider-enforced no-send.** With no human attached, AgentMail itself
  refuses to send, but a lost key loses the inbox. Attaching or claiming a human makes the inbox
  recoverable, and also unlocks sending. That is a choice to make, not a default to guess.
- **Silent drops and a second folder** ([c2](#c2)). A correspondent whose mail authentication is broken
  is dropped without a bounce. Spam lands in `Spam`, which an INBOX-only watcher (what `/email-setup`
  writes today, `src/setup.ts`) never sees. Keeping "no gate" honest would mean watching both folders,
  or deciding out loud that the agent ignores Spam. This is reasoning from c2, not a test.

## See also

- [Owning the drop](owning-the-drop.md) — the route where nothing is rented and the user owns the domain
- [A passkey-only Gmail refuses app passwords](../gotchas/gotcha-gmail-app-password.md) — why a rented
  consumer mailbox already failed once
- `docs/INTAKE.md` in the repository — the route-by-route briefing this page adds a row to
