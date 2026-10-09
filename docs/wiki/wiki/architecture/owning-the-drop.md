---
title: "Owning the drop: a mail endpoint of your own instead of somebody's mailbox"
type: architecture/layer
topic: architecture
summary: "Running a mail server on the user's own machine does not work — inbound SMTP needs port 25, a public MX and an always-on host, and a bounced client message because the PC was off is not recoverable. But the middle ground is real and free: a domain on Cloudflare with Email Routing pointed at a Worker, the Worker stores the raw message in KV, and the local fetcher pulls it with a scoped API token. No provider mailbox, no app password, no OAuth, no consent screen, nothing anyone can revoke."
tags: [architecture, intake, cloudflare, email-routing, workers-kv, self-hosted]
updated: 2026-10-09
sources:
  [
    "https://developers.cloudflare.com/email-service/platform/pricing/",
    "https://developers.cloudflare.com/email-service/examples/email-routing/email-storage/",
    "https://developers.cloudflare.com/kv/api/read-key-value-pairs/",
    "https://developers.cloudflare.com/email-service/configuration/subdomains/",
  ]
files: [C:/Coding/pi-email-listener/src/source.ts, C:/Coding/pi-email-listener/src/imap.ts]
claims:
  - id: c1
    text: "Inbound mail routing on Cloudflare is free and unlimited on the Workers Free plan; what is metered is outbound email, which requires Workers Paid. A package that only ever receives therefore sits entirely on the free side — and the no-send boundary (c13 in the decisions page) is what makes that true, rather than a coincidence."
    status: verified
    support: 0.9
    evidence: ["source: developers.cloudflare.com Email Service pricing — 'Inbound emails (Email Routing) | Unlimited' on Workers Free, while 'Outbound emails (Email Sending) | Not available'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "A Worker with an `email()` handler receives the raw message and can store it, so the receiving end needs no mailbox and no mail server: Cloudflare documents storing incoming mail in a KV namespace as an example, with the raw message available on `message.raw` and a routing rule pointing a pattern at the Worker instead of at a verified address."
    status: verified
    support: 0.9
    evidence: ["source: developers.cloudflare.com 'Email Workers' — 'Process incoming emails using the email() handler… Add the email handler function to your Worker'", "source: developers.cloudflare.com 'Email storage and processing' — 'Store emails in KV… Store emails in a KV namespace for later processing', with the message read as an ArrayBuffer from message.raw", "source: developers.cloudflare.com 'Email routing rules and addresses' — a rule pairs an address pattern with either a verified address or a Worker"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c3
    text: "KV written by the Worker is readable from outside Workers over the REST API with a scoped token, which is what lets a local process pull mail without an OAuth flow of any kind: Cloudflare documents reading key-value pairs from Wrangler and from the REST API, and calls out that REST access shares the account's general API rate limits rather than KV's own."
    status: verified
    support: 0.85
    evidence: ["source: developers.cloudflare.com 'Read key-value pairs' — 'You can read key-value pairs from the command line with Wrangler and from the REST API'", "source: developers.cloudflare.com KV FAQ — 'Yes, you can use Workers KV outside of Workers by using the REST API or the associated Cloudflare SDKs… it is important to note the limits of the REST API that apply'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c4
    text: "Email Routing is a zone-level feature that applies to the apex domain by default, and can be extended to subdomains of the same zone — so an agent address can live on `agent.example.com` without taking over the apex's existing mail, though the onboarding flow for a subdomain differs from the apex and is worth reading before relying on it. One zone can carry up to 30 domains across Email Routing and Email Sending."
    status: verified
    support: 0.8
    evidence: ["source: developers.cloudflare.com 'Subdomains' — 'Email Routing is a zone-level feature that applies to the apex domain (for example, example.com) by default… You can extend either service to subdomains of the same zone, such as mail.example.com or corp.example.com, but the onboarding flow differs between the two. A zone can have up to 30 domains configured'", "source: developers.cloudflare.com 'Enable Email Routing' — onboarding adds MX records for routing plus SPF and DKIM TXT records"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c5
    text: "A mail server on the user's own machine is not a workable receiving end, and the reason is not the software. Inbound SMTP requires a public MX, reachable port 25 and so a host that is up when a stranger's server tries to deliver; consumer connections block inbound 25 and often sit behind carrier NAT; and MTAs retry for hours to days, so a machine that is off overnight is fine while a machine that is off for a week bounces mail in a way the sender cannot distinguish from a wrong address. Running an internet-facing MTA also means permanent security and blocklist maintenance. This is reasoning from how SMTP works plus what consumer connections permit, not a measurement."
    status: unverified
    support: 0.75
    evidence: ["reasoning: SMTP queues and retries on the sender's side, which is why a receiving host that is intermittently up is partly workable and why an unavailable one is silently harmful — the failure lands on the sender, days later, as a bounce", "reasoning: an MX record for a residential address needs a stable public IP and an open port 25, neither of which a home connection is obliged to provide"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c6
    text: "The walls hit on the way to this design are policy, not protocol, and they get taller the closer a design sits to reading somebody's real mailbox: a personal Microsoft account cannot register an app at all, a corporate one needs an administrator's consent even for Mozilla's own client, Google declined to issue an app password for a fresh account with 2-Step Verification properly configured, basic authentication is gone from Outlook.com and Exchange Online IMAP, and a client's local store holds a cache rather than the mailbox. The consequence for design is that a rented address is always a named provider's policy away from breaking, which is the argument for the address being one the user controls."
    status: verified
    support: 0.85
    evidence: ["user: Andrei Li, 2026-10-09 — the agent Gmail account, with 2-Step Verification on and a phone number registered, still refusing app passwords", "source: Microsoft Q&A on Entra portal sign-in for personal accounts; Microsoft's COM automation support statement; support.microsoft.com on removing basic authentication from Outlook.com", "source: bugzilla.mozilla.org 1815715 — Thunderbird users met with 'need admin approval'", "source: support.mozilla.org question 1366732 — folders other than the inbox not stored locally despite offline sync settings", "file: docs/INTAKE.md — the route-by-route table, with what each one rents and who can revoke it"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c7
    text: "Two counter-options were researched and neither is a free lunch: ForwardEmail's free tier forwards mail but stores nothing, so using it as the agent's mailbox means its paid tier (about three dollars a month, 10 GB, API access, unlimited domains — the protocol it speaks is not stated on that page); and the Gmail API needs a consent screen whose Testing status issues refresh tokens that expire in seven days, while publishing to Production as an external app brings verification requirements — branding, a homepage on a verified domain, a privacy policy. Neither removes the dependence on a provider's terms; both trade it for a bill or for a weekly re-authentication."
    status: verified
    support: 0.8
    evidence: ["source: forwardemail.net/en/pricing — 'Can I send and receive emails with the Free plan? No, the Free plan only supports email forwarding… you cannot send emails directly from your custom domain or store emails on our servers'; the paid tier is 'Enhanced Protection ($3/month)… professional email with sending/receiving capabilities, 10GB storage, and API access'", "source: support.google.com/cloud/answer/10311615 — external production apps need a homepage on a verified domain, a privacy policy, and verification before app branding is displayed", "source: developers.google.com OAuth documentation — a consent screen in Testing status with an external user type issues a refresh token expiring in 7 days"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## The shape

```
someone ──SMTP──▶ Cloudflare Email Routing ──▶ Worker (email handler) ──▶ KV
                                                                          │
                          the agent's machine, whenever it is on ──HTTPS──┘
                          (scoped API token, no OAuth, no app password)
```

The split is the one this package already uses, with the always-on half moved from the user's machine
to a free edge endpoint: something durable holds the mail, and the machine that must be awake to *act*
on it only has to be awake to *collect* it.

## What it buys

- **Nobody can revoke it.** The zone, the Worker and the token belong to the user. There is no
  "app passwords are not available for your account", no consent screen, no tenant, no policy change
  that ends the feature.
- **An address on a real domain** — `agent@their-domain` rather than a consumer mailbox, which is also
  the address a client is asked to cc.
- **Free at any plausible personal volume**, because the metered direction is sending and there is no
  sending.

## What it costs

- **Setup only a technical person can do**: a domain, a Cloudflare account, a Worker, a KV namespace, a
  routing rule and an API token. That is a much larger ask than "make a Gmail", and it is the honest
  limit of this route — for Andrei it is an afternoon; for the project manager he is building this for,
  it is not.
- **A new provider adapter** to read KV (list keys, fetch values, cursor on the last key), which is the
  same two-call seam and nothing else.
- **Hosting it for other people would mean running a mail service** — the tokens could be handed out by
  a service we operate, but then we hold other people's correspondence and the duties that come with
  it. That is a business decision, not an adapter.

## See also

- [Getting at a Microsoft mailbox](../gotchas/gotcha-microsoft-mailbox-access.md) — the provider routes,
  and why three of them were rejected
- [A passkey-only Gmail refuses app passwords](../gotchas/gotcha-gmail-app-password.md) — the incident
  that makes owning the drop worth the setup
- `docs/INTAKE.md` in the repository — the full briefing written for Andrei to think with: every route,
  what each rents, who can revoke it, and the research still missing
