---
title: "Owning the drop: a mail endpoint of your own instead of somebody's mailbox"
type: architecture/layer
topic: architecture
summary: "Running a mail server on the user's own machine does not work — inbound SMTP needs port 25, a public MX and an always-on host, and a bounced client message because the PC was off is not recoverable. But the middle ground is real and free: a domain on Cloudflare with Email Routing pointed at a Worker, the Worker stores the raw message in KV, and the local fetcher pulls it. No provider mailbox, no app password, no OAuth, no consent screen, nothing anyone can revoke. Since Wrangler 4.113 one wrangler login plus one wrangler deploy creates the Worker, its storage and the routing rule; what is left for the user is owning a domain on Cloudflare and one Onboard Domain click."
tags: [architecture, intake, cloudflare, email-routing, workers-kv, self-hosted]
updated: 2026-10-09
sources:
  [
    "https://developers.cloudflare.com/email-service/platform/pricing/",
    "https://developers.cloudflare.com/email-service/examples/email-routing/email-storage/",
    "https://developers.cloudflare.com/kv/api/read-key-value-pairs/",
    "https://developers.cloudflare.com/email-service/configuration/subdomains/",
    "https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/",
    "https://developers.cloudflare.com/workers/wrangler/configuration/",
    "https://developers.cloudflare.com/api/resources/email_routing/subresources/dns/methods/create/",
    "https://developers.cloudflare.com/workers/platform/deploy-buttons/",
    "https://developers.cloudflare.com/email-service/reference/postmaster/",
    "https://developers.cloudflare.com/email-service/platform/limits/",
    "https://developers.cloudflare.com/email-service/configuration/domains/",
    "https://developers.cloudflare.com/kv/platform/limits/",
    "https://forwardemail.net/en/faq",
    "raw/sessions/2026-10-09-session-2026-10-09-080256.md",
    "raw/sessions/2026-10-09-session-2026-10-09-080352.md",
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
    text: "Two counter-options were researched and neither is a free lunch: ForwardEmail's free tier forwards mail but stores nothing, so using it as the agent's mailbox means its paid tier (about three dollars a month, 10 GB, API access, unlimited domains — and IMAP, confirmed in c12); and the Gmail API needs a consent screen whose Testing status issues refresh tokens that expire in seven days, while publishing to Production as an external app brings verification requirements — branding, a homepage on a verified domain, a privacy policy. Neither removes the dependence on a provider's terms; both trade it for a bill or for a weekly re-authentication."
    status: verified
    support: 0.8
    evidence: ["source: forwardemail.net/en/pricing — 'Can I send and receive emails with the Free plan? No, the Free plan only supports email forwarding… you cannot send emails directly from your custom domain or store emails on our servers'; the paid tier is 'Enhanced Protection ($3/month)… professional email with sending/receiving capabilities, 10GB storage, and API access'", "source: support.google.com/cloud/answer/10311615 — external production apps need a homepage on a verified domain, a privacy policy, and verification before app branding is displayed", "source: developers.google.com OAuth documentation — a consent screen in Testing status with an external user type issues a refresh token expiring in 7 days"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c8
    text: "Wrangler 4.113.0 or later creates Email Routing rules that send mail to a Worker from a top-level `addresses` field in the Wrangler configuration when `wrangler deploy` runs, and it auto-provisions KV, R2 and D1 bindings that are declared without resource ids. So one `wrangler deploy` can create the Worker, its storage and its routing rule."
    status: verified
    support: 0.85
    evidence: ["source: developers.cloudflare.com 'Email routing rules and addresses' — 'This feature requires Wrangler 4.113.0 or later… When you run wrangler deploy or wrangler triggers deploy, Wrangler reconciles the Email Routing rules for the addresses you listed. It adds rules for new entries, updates the rules it manages, and removes managed rules that are no longer listed'", "source: developers.cloudflare.com Wrangler configuration — 'Wrangler can automatically provision resources for you when you deploy your Worker without you having to create them ahead of time. This currently works for the following resources: KV, R2, D1… add bindings to your configuration file without adding resource IDs'", "source: Cloudflare changelog 2026-09-04 'Manage Email Routing rules with Wrangler'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c9
    text: "Wrangler's OAuth login requests every scope in its catalog by default, and the catalog includes `email_routing:write` ('See and change Email Routing settings, rules, and destination addresses') but only `zone:read` for zones. Enabling Email Routing on a zone through the API (POST /zones/{zone_id}/email/routing/dns, which adds and locks the MX and SPF records) accepts only the `Zone Settings Write` permission. The consequence, which is inference rather than test: a wrangler login can create the routing rule, and the zone's one-time onboarding stays a dashboard click. Not checked: whether `email_routing:write` covers enabling too, and whether a Worker-only rule needs a verified destination address first."
    status: verified
    support: 0.75
    evidence: ["command: curl https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/workers-auth/src/core/scopes.ts → '\"zone:read\": \"Grants read level access to account zone.\"', '\"email_routing:write\": \"See and change Email Routing settings, rules, and destination addresses.\"', 'export let DefaultScopeKeys = Object.keys(DefaultScopes) as Scope[];'", "source: Cloudflare API reference 'Enable Email Routing' — 'Enable your Email Routing zone. Add and lock the necessary MX and SPF records. POST /zones/{zone_id}/email/routing/dns — Accepted Permissions (at least one required): Zone Settings Write'", "source: Cloudflare API reference 'Create routing rule' — 'Accepted Permissions (at least one required): Email Routing Rules Write'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c10
    text: "A Deploy to Cloudflare button clones the source repository into the deploying user's own GitHub or GitLab account and builds it there with Workers Builds, so using one requires that the person have a GitHub or GitLab account. It does auto-provision KV namespaces and can prompt for secrets declared in .dev.vars.example. For a project manager that makes running wrangler from the setup command the shorter path."
    status: verified
    support: 0.8
    evidence: ["source: developers.cloudflare.com 'Deploy to Cloudflare buttons' — 'Clone a Git repository: Cloudflare clones your source repository into the user's GitHub/GitLab account where they can continue development after deploying'", "source: the same page — 'If your Worker application requires Cloudflare resources, they will be automatically provisioned as part of the deployment… KV namespaces' and 'Worker secrets can be defined in a .dev.vars.example or .env.example file'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c11
    text: "Cloudflare documents no spam filter for inbound Email Routing. What it does document is rejection: mail that fails both SPF and DKIM, mail that fails according to the sender's DMARC policy, and senders on realtime block lists (554). Messages over 25 MiB are rejected, and a domain carries at most 200 routing rules. So an authenticated stranger's spam reaches the Worker, which is consistent with no gate. Whether the authentication rejections happen in-session, so the sender sees a bounce, is not stated."
    status: verified
    support: 0.75
    evidence: ["source: developers.cloudflare.com Email Service postmaster — 'The email must either pass SPF or be correctly signed with DKIM. Emails that fail both checks are rejected… For Email Routing, incoming emails are rejected if they fail authentication according to the sender's DMARC policy'", "source: the same page — 'For Email Routing, inbound mail from senders on RBLs is rejected with an SMTP error similar to: 554'", "source: developers.cloudflare.com Email Service limits — 'Inbound message size | 25 MiB | Messages larger than this are rejected' and 'Routing rules per domain | 200'", "answers docs/INTAKE.md §7 question 4"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c12
    text: "ForwardEmail's paid plans include IMAP (since 2023-10-16) at imap.forwardemail.net:993 with an alias-specific generated password, so the existing imap source can read it. But ForwardEmail serves aliases on the user's own domain, so that route costs a domain plus the $3/month plan, not just the plan."
    status: verified
    support: 0.8
    evidence: ["source: forwardemail.net/en/faq — 'Yes, as of October 16, 2023 we support receiving email over IMAP as an add-on for all paid users'", "source: the same FAQ — 'the IMAP user must be the email address of an alias that exists for the domain at My Account Domains – and the IMAP password must be an alias-specific generated password… enter imap.forwardemail.net… enter 993 (SSL/TLS)'", "answers docs/INTAKE.md §7 question 2"]
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

- **A domain, and one dashboard click, are what is left of the setup.** Since Wrangler 4.113 a single
  `wrangler deploy` creates the Worker, its storage and the routing rule ([c8](#c8)), and `wrangler
  login` is one browser consent that already carries `email_routing:write` ([c9](#c9)). What that login
  cannot do is switch Email Routing on for the zone, which wants `Zone Settings Write`, so the
  domain's one-time **Onboard Domain** stays a dashboard click. Onboarding puts the domain's MX records
  on Cloudflare ("Cannot use Email Routing with external mail servers", per the domains page), so a
  domain whose mail already lives elsewhere needs a subdomain ([c4](#c4)). The real ask of a project
  manager is therefore owning a domain on Cloudflare, which is a purchase, not operating a Worker. A
  Deploy to Cloudflare button is not the shortcut it looks like: it needs a GitHub or GitLab account
  ([c10](#c10)).
- **A new provider adapter** to read KV (list keys, fetch values, cursor on the last key), which is the
  same two-call seam and nothing else. Free-plan KV allows 1,000 writes a day to different keys and
  100,000 reads (KV limits page), so a 30-second poll should be a read of a counter, not a list.
  Design note, not built: if the Worker answers its own HTTPS endpoint behind a generated secret, the
  local side needs no Cloudflare token at all.
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
