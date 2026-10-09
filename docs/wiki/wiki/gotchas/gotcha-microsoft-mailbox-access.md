---
title: "Getting at a Microsoft mailbox: what works, what is a dead end, and the one trick that saves a personal account"
type: gotcha
topic: gotchas
summary: "Every route into a Microsoft mailbox is an OAuth app registration inside a tenant — including the routes that look like they avoid one. Hooking the user's own mail client does not dodge the wall, it moves it: Outlook's COM automation is explicitly unsupported and dying, and a third-party client faces the same tenant consent policy. The useful exception: an app registered in any tenant, configured to allow personal Microsoft accounts, can read a personal outlook.com mailbox with the user's own consent."
tags: [outlook, microsoft, consent, oauth, outlook-com, thunderbird, com-automation, dead-end]
updated: 2026-10-09
sources:
  [
    "https://learn.microsoft.com/en-ca/answers/questions/5934701/clarification-on-classic-outlook-com-automation-su",
    "https://wiki.mozilla.org/Thunderbird/Maildir",
    "https://mc.merill.net/message/MC1304287",
    "https://bugzilla.mozilla.org/show_bug.cgi?id=1815715",
  ]
files: [C:/Coding/pi-email-listener/README.md, C:/Coding/pi-email-listener/docs/wiki/wiki/architecture/microsoft-graph-source.md]
claims:
  - id: c1
    text: "Hooking the user's Outlook client is a dead end. Microsoft states there is no supported scenario for a local desktop process relying on the Classic Outlook COM object model (`Outlook.Application`, MailItem, desktop events) once the user is on new Outlook, which has no COM or VSTO extensibility at all; classic Outlook remains the only place COM works, its trajectory is to become optional and then deprecated or removed, and Microsoft names 'external desktop process interacting with the Outlook session' as a scenario with no replacement in the new model. Their own migration guidance points at web add-ins for the client and Graph for the mailbox."
    status: verified
    support: 0.95
    evidence: ["source: Microsoft Q&A \"Clarification on Classic Outlook COM automation support boundaries and migration path to new Outlook for Windows\" — \"there is no officially supported scenario where a local Windows desktop application can rely on the Classic Outlook COM object model… and expect that behavior to function reliably in the new Outlook for Windows\"; \"if Classic Outlook is no longer installed or available to users, then all Outlook Object Model (COM-based) automation scenarios will cease to function\"; \"There is no replacement for COM-based automation from an external local process\"", "source: support.microsoft.com \"Feature comparison between new Outlook and classic Outlook\" — features listed as not supported in the new client"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "Hooking another client does not dodge tenant consent either. Thunderbird reads Microsoft 365 mail through its own OAuth registration, and when that registration's permissions were bumped, its own users were met with \"need admin approval\" for 'Mozilla Thunderbird' — so a third-party client is subject to the same tenant policy as any app. Microsoft has been tightening exactly that: from June 2026 the default user consent policy for Microsoft Graph requires admin consent for additional Exchange-related permissions unless the app is approved by the tenant's mail client policy, with existing consents and custom policies unaffected."
    status: verified
    support: 0.8
    evidence: ["source: bugzilla.mozilla.org 1815715 — \"After successful Microsoft multi-factor authentication, it complained about 'need admin approval' for 'Mozilla Thunderbird'\"", "source: mc.merill.net message MC1304287 \"Upcoming secure-by-default changes for Exchange APIs\" — \"Starting June 2026, Microsoft will update the default user consent policy for Microsoft Graph to require admin consent for additional Exchange-related permissions. Users cannot grant consent for these unless apps are approved in the Mail client policy.\"", "source: support.mozilla.org \"Microsoft OAuth Authentication and Thunderbird in 2026\" — the article exists because the Microsoft side changed"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c3
    text: "Thunderbird's maildir store is not a foundation to build a reader on: it is documented as not feature complete, not enabled by default, switched on with a hidden preference (`mail.serverDefaultStoreContractID`) rather than a per-account setting, recommended only for a fresh profile, and still carries unresolved move and copy bugs including a process crash when copying through CopyService. Reading Thunderbird's default mbox store is possible but means parsing a large file plus its .msf index, against a client whose Microsoft access is itself at the mercy of tenant policy."
    status: verified
    support: 0.85
    evidence: ["source: wiki.mozilla.org/Thunderbird/Maildir — \"Maildir is not feature complete, therefore it is not enabled by default\"; \"you need to set the string pref 'mail.serverDefaultStoreContractID'\"; \"we suggest you to create a fresh profile\"; \"copying using CopyService results in process crash\"", "source: source-docs.thunderbird.net folder storage — local message storage is either an mbox file or a maildir directory, through nsIMsgPluggableStore"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c4
    text: "The exception that saves a personal account: the tenant an app is registered in does not have to be the mailbox's tenant. An app registered in any tenant — a friendly organisation's, or one created for the purpose — with supported account types set to include personal Microsoft accounts, can be authorised by a personal outlook.com mailbox, which then signs in with the user's own consent and no administrator. This is why the earlier plan (test with a personal outlook.com address) survives: what is needed is any tenant to register the app in, not a tenant that owns the mailbox."
    status: verified
    support: 0.8
    evidence: ["file: src/microsoft-auth.ts — the authority is `login.microsoftonline.com/{tenant}/oauth2/v2.0/...` with tenant defaulting to \"common\", which is what admits work and personal accounts through one registration", "file: README.md — the registration step already specifies \"Accounts in any organizational directory and personal Microsoft accounts\"", "command: a placeholder client id reached the live endpoint and was answered with AADSTS50059 (no tenant identified) rather than a rejection of the request shape"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c5
    text: "The local store of a mail client is a cache, not a copy of the mailbox, so a provider that reads it is scoped to what the client happened to put on disk. Thunderbird's own users report that folders other than the inbox are not stored locally even with 'Keep messages in all folders' and 'Synchronize all messages locally regardless of age' switched on, that a folder has to be opened before it syncs, and that individual folders need their own offline flag under the account's Advanced settings. The inbox is the reliable part, which happens to be where arriving mail lands — but a client-store provider must say plainly that it sees the inbox, not the mailbox, and that anything the client has not synced is invisible to the agent."
    status: verified
    support: 0.7
    evidence: ["source: support.mozilla.org question 1366732 — 'I have found that folder contents are not synchronized unless the folder is opened' with offline sync and all-folders settings enabled", "source: support.his.com KB 709 — offline use is configured per folder under Synchronization & Storage → Advanced, and can be limited by age or size", "source: source-docs.thunderbird.net folder storage — each folder is an mbox file (no extension) plus a Mork `.msf` database of headers, so the messages are plain text but the format is an internal one", "unverified: whether the mbox can be read while Thunderbird is running, and how compaction rewriting the file interacts with a reader tracking a byte offset — a reader would have to dedupe by Message-ID rather than by position"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c6
    text: "An agent with its own mail address is the one intake route that needs no app registration and no tenant consent at all, because the mailbox being read is one the agent's owner chose and controls. Gmail app passwords still work in 2026 for exactly this: a 16-character password, created once with 2-Step Verification on, used with imap.gmail.com on port 993 — no Cloud project, no OAuth consent screen, no verification review, and no administrator. It also makes the sender's provider irrelevant: whatever the user forwards from, the message arrives as mail, so one IMAP adapter covers Outlook, Google, Fastmail, Proton Bridge and any other host instead of one adapter each. Two costs are real: an Exchange Online tenant created since 2021 has automatic forwarding to external recipients off by default (AutoForwardingMode 'Off', with 5.7.520 rejections), so a corporate user may be limited to forwarding by hand or to asking their admin to allow it; and a forward rewrites the envelope — the real sender and thread live in the quoted body — whereas cc'ing the agent preserves them exactly."
    status: verified
    support: 0.8
    evidence: ["source: support.google.com/mail/answer/185833 — 'An app password is a 16-digit passcode that gives a less secure app or device permission to access your Google Account. App passwords can only be used with accounts that have 2-Step Verification turned on'; created at myaccount.google.com/apppasswords", "source: learn.microsoft.com Set-HostedOutboundSpamFilterPolicy — AutoForwardingMode 'Automatic: This value is the default... In 2021, the value changed to Off for new organizations and for existing organizations that weren't actively using the Automatic value'", "source: learn.microsoft.com 'Control external email forwarding and fix 5.7.520 errors' — admins can block inbox rules that forward to external recipients, which rejects with 5.7.520", "file: src/source.ts — the cursor comment already names IMAP's shape (UIDVALIDITY plus the last UID), so this provider needs no new seam"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## The wall, stated plainly

A Microsoft mailbox cannot be read without an OAuth app registration, and an app registration must live
in a Microsoft Entra **tenant**. Personal accounts (outlook.com, hotmail, live) are routed to the
internal *Microsoft Services* tenant without being members of it, so they cannot register an app
there; and because Microsoft has removed basic authentication from Outlook.com's IMAP as well, the
IMAP route needs the same registration. There is no credential-only way in.

## What this rules out

- **Classic Outlook COM automation** ([c1](#c1)) — works today only where classic Outlook is installed,
  is explicitly unsupported for new Outlook, and disappears with the classic client.
- **A third-party client as the consent-free path** ([c2](#c2)) — the client's registration is
  subject to the same tenant policy, and Microsoft is tightening the default policy for
  Exchange-related permissions.
- **Thunderbird maildir as an easy file-per-message store** ([c3](#c3)) — incomplete, off by
  default, and reached through a hidden preference.

## What is left

**Chosen:** give the agent an address of its own and let mail be sent to it ([c6](#c6)) — no
registration, no consent, no client, and the sender's provider stops mattering. That is the front
door now; the routes below it are what remains for reading a mailbox the agent does not own.

1. **Register the app in a tenant you can reach** ([c4](#c4)), set it to allow personal Microsoft
   accounts, and a personal outlook.com mailbox works with the user's own consent. A corporate
   mailbox then needs its own admin to consent — or to register its own app.
2. **Get your own tenant** (Azure free signup, or the Microsoft 365 Developer Program sandbox).
4. **Read a client's local store** ([c5](#c5)) — no registration of ours at all, and one reader
   covers many providers, but it only sees what that client synced on that machine.
5. **Do not go to Microsoft for the first live mailbox at all** — Google imposes no such tenant
   structure on an individual, which is why the Gmail path may prove the shorter route to a
   working end-to-end demo even though Outlook is the destination.

## Which generalises further

The client store generalises across **providers** — one reader for Microsoft, Google, Fastmail,
Proton Bridge and any IMAP host — while OAuth generalises across **machines**: it works headless, on a
server, with the client closed. They fail in opposite directions, so supporting both is not
redundancy: a client store is the only route for somebody whose tenant allows a known client but
would never approve a new app registration, and OAuth is the only route for an agent that runs
where no client does.

## See also

- [Outlook through Microsoft Graph](../architecture/microsoft-graph-source.md) — the source that
  needs the registration, and the wall Andrei hit at the Entra portal
