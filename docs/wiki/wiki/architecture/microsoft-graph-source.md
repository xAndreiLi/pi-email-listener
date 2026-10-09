---
title: "Outlook through Microsoft Graph: delta bounded by a date, MIME for the message, device code for the sign-in"
type: architecture/module
topic: architecture
summary: "The Microsoft source reads a folder with a delta query bounded by receivedDateTime, fetches each message as MIME through $value, and signs in once with the device code flow — no client secret, no redirect URI, and the refresh token stored beside the spool. The client id is per account, so somebody else's mailbox can run under their own Entra app and their own consent."
tags: [outlook, microsoft-graph, oauth, device-code, delta, provider]
updated: 2026-10-09
sources: [home: raw/sessions/2026-10-09-session-2026-10-09-061532.md]
files:
  [
    C:/Coding/pi-email-listener/src/graph.ts,
    C:/Coding/pi-email-listener/src/microsoft-auth.ts,
    C:/Coding/pi-email-listener/scripts/mail-auth.ts,
    C:/Coding/pi-email-listener/scripts/graph-check.ts,
    C:/Coding/pi-email-listener/README.md,
  ]
claims:
  - id: c1
    text: "Outlook is the first provider because a person Andrei works with needs it, so the OAuth path was designed in rather than bolted on. That decided Microsoft Graph over IMAP: Graph needs no dependency (plain HTTPS), and it is the surface Microsoft is moving mail onto."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — \"Lets design for outlook in mind, as i have a person who needs it. So lets just get everything we'd need for that immediately.\"", "file: docs/PLAN.md — §5 Providers — Outlook first"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "The source lists with a delta query bounded by a date — `GET /me/mailFolders/{folder}/messages/delta` with `$filter=receivedDateTime ge {since}` and a page size — because delta returns a `deltaLink` that is the sync position the cursor wants, and because the date bound stops a first run from copying an entire mailbox to disk. Delta supports only that one filter expression and only `$orderby=receivedDateTime desc`, which is exactly what this needs and no more."
    status: verified
    support: 0.85
    evidence: ["file: src/graph.ts — deltaUrl() builds the filter from the account's `since`; listNew() follows @odata.nextLink for up to 10 pages and keeps an unfinished page as the cursor", "source: learn.microsoft.com /graph/api/message-delta — \"The only supported $filter expressions are $filter=receivedDateTime+ge+{value} or $filter=receivedDateTime+gt+{value}. The only supported $orderby expression is $orderby=receivedDateTime+desc.\"", "command: npm run graph-check → 'the first request is the inbox delta, bounded by the start date'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c3
    text: "Each message is fetched as MIME with `GET /me/messages/{id}/$value`, so the spool holds the message as it arrived and every downstream step — envelope parsing, the link and attachment quarantine, the pointer — is the same code the fixture and any future provider go through. Deletions that appear in the delta as `@removed` are skipped rather than stored."
    status: verified
    support: 0.9
    evidence: ["file: src/graph.ts — fetch(id) requests `$value` with `accept: text/plain`; listNew() skips entries carrying @removed", "command: npm run graph-check → 'every message is fetched as raw MIME', 'a removal in the delta is not stored', 'the spool reads oldest first, whatever order Graph used'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c4
    text: "Sign-in is the device code flow on a public client: no client secret and no redirect URI, so the app registration only needs `Mail.Read` (delegated) and \"Allow public client flows\" set to yes, while `offline_access` is requested at run time and is what buys the refresh token. The token is written to the account's spool directory and refreshed when it is within a minute of expiring."
    status: verified
    support: 0.85
    evidence: ["file: src/microsoft-auth.ts — signIn() posts to /devicecode and polls /token handling authorization_pending and slow_down; accessTokenFor() refreshes with grant_type=refresh_token and keeps a rotated refresh token", "file: scripts/mail-auth.ts — the one-time `npm run mail:auth <account>` entry point", "file: README.md — the app registration steps, including \"Allow public client flows: Yes\" and Mail.Read delegated", "untested: nothing here has been run against Microsoft yet — no Entra app exists, so the scopes and the flow are unproven against the real endpoint"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c5
    text: "The client id lives on the account, not on the package, so a mailbox in somebody else's tenant can run under an app their own organisation registered and consented to. That keeps the administration where the mailbox is, and it is the arrangement that answers the corporate case: a tenant that does not let users consent to apps needs an administrator to grant Mail.Read once, under Enterprise applications."
    status: user-stated
    support: 0.8
    evidence: ["user: Andrei Li, 2026-10-09 — \"Lets design for outlook in mind, as i have a person who needs it.\"", "file: src/config.ts — AccountConfig carries clientId, tenant, mailbox, folder and since per account", "file: README.md — the corporate-consent note and the recommendation that another tenant register its own app"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c6
    text: "The sign-in state machine is verified offline even though no Entra app exists yet: the device code flow's four branches (authorization_pending, slow_down, success, refresh) and its failure modes are driven against a stubbed identity platform by `npm run auth-check`, 16 checks. Separately, the request shape has been accepted by the live endpoint — a placeholder client id produced a real `AADSTS50059` answer from login.microsoftonline.com rather than a malformed-request error — and with no stored token, `fetch:once` fails with the one command that fixes it rather than a stack trace."
    status: verified
    support: 0.85
    evidence: ["command: npm run auth-check → 16 checks pass, including 'the sign-in survives a pending and a slow_down before succeeding', 'the device code was requested with the client id and the two scopes', 'an expiring token is refreshed before it is used', 'a rotated refresh token replaces the old one', 'signing in again repairs a corrupted token store'", "command: npm run mail:auth outlook with a placeholder client id → 'invalid_request: AADSTS50059: No tenant-identifying information found…' from the real endpoint, which is Microsoft parsing the request and rejecting the client id rather than the shape", "command: npm run fetch:once with no kept sign-in → 'no stored sign-in for account \"outlook\" — run: npm run mail:auth outlook'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c7
    text: "A personal Microsoft account cannot register the app this source needs, and there is no way around it: app registrations live in a Microsoft Entra tenant, and outlook.com/hotmail.com accounts are routed to the 'Microsoft Services' tenant where they are not members, so the Entra portal refuses them (\"Selected user account does not exist in tenant 'Microsoft Services' and cannot access the application…\"). Basic authentication against Outlook.com has been removed as well, so the IMAP alternative needs the same OAuth app registration — which means Graph, IMAP and every other route into a Microsoft mailbox all begin with a work or school account in a tenant. Andrei's throwaway outlook.com address therefore cannot be the test target; a tenant he has access to (his person's organisation, eventually with a test mailbox) is."
    status: verified
    support: 0.9
    evidence: ["command: Andrei signing in to entra.microsoft.com with a personal outlook.com account → \"Selected user account does not exist in tenant 'Microsoft Services' and cannot access the application '74658136-14ec-4630-ad9b-26e160ff0fc6' in that tenant. The account needs to be added as an external user in the tenant first.\", 2026-10-09", "source: learn.microsoft.com Q&A \"Personal Outlook.com account cannot create or access an Entra tenant for Azure App Registration\" — AADSTS50020, the account cannot create a tenant or start an Azure free subscription from that state", "source: support.microsoft.com \"Modern Authentication Methods now needed to continue syncing Outlook Email in non-Microsoft email apps\" — basic authentication for Outlook.com is being removed, so third-party IMAP must use OAuth", "source: learn.microsoft.com quickstart-register-app — \"An Azure account that has an active subscription\" and at least the Application Developer role are prerequisites for registering an app"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## What is proven, and what is not

`npm run graph-check` drives the source against a stubbed Graph — 12 checks covering the delta URL and
its filter, paging, `@removed`, the MIME fetch, ordering, the hashed file name for a long id, and the
cursor round-trip. None of that touches Microsoft.

What remains unproven until a real Entra app exists: that the app registration is accepted, that
`Mail.Read` plus `offline_access` return a refresh token, and that the tenant lets the user consent.
Those are the risks the README's setup steps exist to remove, and they are Andrei's to run.

## Why not IMAP

One IMAP adapter would cover Gmail, Fastmail, Proton Bridge and self-hosted mail as well, and it is
still the plan for those. It was not chosen first because Microsoft has switched basic authentication
off for IMAP in Exchange Online — so the corporate case needs OAuth2 anyway — and because Graph needs
no dependency at all, which keeps this package's only runtime imports in Node itself.
