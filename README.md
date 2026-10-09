# pi-email-listener

**Status: the agent-address front door is built.** A mailbox the agent owns is read over IMAP, every
message turns the agent in a pi session, and the wake is a pointer rather than a summary. Verified
offline (85 checks) and live against pi over RPC. Not yet run against a real mailbox — that needs an
account and an app password, which is yours to create.

## The idea

**The agent gets an email address of its own, and mail comes to it.** You cc the agent on a thread, or
forward it a message. That arrived-at address is the front door.

It is deliberately the least privileged design we could find, after three others were tried and
measured against what they actually cost:

| Route | Why not |
|---|---|
| Read your inbox through Microsoft Graph | Needs an app registration in an Entra tenant, and a personal outlook.com account cannot register one at all; a corporate one needs an admin to consent |
| Read your client's local store | Only sees what that client synced on that machine, needs the client installed, and reads an undocumented internal format |
| Hook Outlook by COM | Microsoft states it is unsupported in new Outlook and that all COM automation ceases with classic Outlook — and names "external desktop process" as having no replacement |
| **An address the agent owns** | No registration, no tenant, no consent, no client, no OS dependency — and the sender's provider stops mattering |

That last row is the reason it won. Because whatever someone cc's or forwards from arrives as mail,
**one IMAP adapter covers Outlook, Gmail, Fastmail, Proton Bridge, a corporate Exchange mailbox and
anything else** — no per-provider adapters, and the only thing anyone has to obtain is a password for
a mailbox they already control.

Two consequences worth naming:

- **Privacy inverts.** The other routes ask for the whole inbox. This asks only for what you hand
  over.
- **The agent becomes a participant, not a watcher.** It has an identity, which is also what would
  make replying possible later, under its own name.

## How it is put together

```
mailbox the agent owns ──▶ fetcher (no pi) ──▶ spool of files ──▶ extension in a session ──▶ turn
   IMAP, reconnect, cursor      .eml + index      opt-in via /email-watch
```

The fetcher owns the connection and the sync position, and its only output is files, so it runs with
or without a session. The extension owns the wake. Nothing turns an agent until `/email-watch` is run
in that session.

## Set it up

**1. Make a mailbox for the agent.** A fresh Gmail account is the easiest: free, and it still offers
app passwords. Turn on 2-Step Verification, then create an app password at
<https://myaccount.google.com/apppasswords> — 16 characters, no OAuth, no Cloud project, no consent
screen.

**2. Tell the package about it** in `<agent dir>/pi-email-listener.json`:

```json
{
  "accounts": [
    {
      "name": "agent",
      "provider": "imap",
      "host": "imap.gmail.com",
      "user": "your.agent@gmail.com",
      "passwordEnv": "PI_EMAIL_AGENT_PASSWORD",
      "folder": "INBOX"
    }
  ],
  "pollSeconds": 30
}
```

`password` works too, but `passwordEnv` names an environment variable instead of storing it in the
file. The mailbox is never modified: nothing is marked read, moved or deleted.

**3. Fetch once** to prove it:

```bash
npm run fetch:once     # or npm run fetch to poll
```

**4. Start watching in a session** with `/email-watch` (again to stop). Then cc the agent on a thread
or forward it something, and watch the turn happen.

## What works today

- **Sources**: `imap` (a mailbox the agent owns — the front door), `graph` (read your own Microsoft
  mailbox directly, if you can get an app registration), and `fixture` (a directory of `.eml` files,
  for testing with no credentials).
- **Spool**: every new message as a raw `.eml` plus an append-only `index.jsonl` line per account,
  under `<agent dir>/mail/<account>/`, with the source's cursor in `cursor.json`. Re-runs never store
  a message twice.
- **Wake**: every message turns the agent — no gate, no batching, no suppression. The wake is a
  pointer: sender, subject, time, account, and the file to read. Never the body.
- **Quarantine**: a message carrying a link or an attachment has `bash`, `edit` and `write` refused
  until that turn ends, so the agent can report a stranger's mail but not act on it unattended.
- **Forwarded mail**: a `Fwd:` message gives up its real author inside the quoted block, so the
  pointer names who actually wrote it rather than blaming the forwarder.

## Checks

```bash
npm run test:all   # 85 checks: spool and fetcher, extension against a stub pi API,
                   # Graph against a stubbed Graph, sign-in against a stubbed identity
                   # platform, IMAP against a stubbed server. Offline, no credentials.
npm run live       # drives a real pi over RPC, settles it, spools a message and watches for a
                   # turn with no prompt behind it. Spawns a session and costs a model call.
```

## Reading your own mailbox instead (Outlook, Microsoft 365)

`provider: "graph"` reads a Microsoft mailbox directly, which is a different bargain: it sees
everything, and it needs an app registration.

> **An app registration lives in a Microsoft Entra tenant, and a personal outlook.com or hotmail.com
> account is not in one.** Signing in to the Entra portal with a personal Microsoft account fails
> with "Selected user account does not exist in tenant 'Microsoft Services'". Use a work or school
> account, or a tenant of your own.
>
> **The tenant that registers the app does not have to be the mailbox's tenant.** An app registered
> anywhere, with supported account types including personal Microsoft accounts, can be authorised by
> a personal outlook.com mailbox — that user consents for themselves.
>
> **Expect an administrator for a corporate mailbox.** Third-party clients face the same policy —
> Thunderbird's users have been met with "need admin approval" — and Microsoft's default consent
> policy for Exchange-related permissions is being tightened to require it.

1. Register an app at <https://entra.microsoft.com> → **App registrations** → **New registration**.
   Supported account types: "Accounts in any organizational directory and personal Microsoft
   accounts". Under **Authentication → Advanced settings**, set **Allow public client flows** to
   **Yes**. Under **API permissions**, add **Microsoft Graph → Delegated → `Mail.Read`** (not
   `offline_access`; that is requested at run time). Copy the **Application (client) ID**.
2. Put it in the account as `"provider": "graph"` with `"clientId"`, `"tenant": "common"`, and
   `"since"` (where a first sync starts, so a first run does not copy a whole mailbox).
3. `npm run mail:auth <account>` — prints a code to enter at microsoft.com/devicelogin. The refresh
   token is stored beside the spool.

## A note on dependencies

This repository installs its own dependencies; `node_modules` is a normal install, not a junction into
the pi install. Do not replace it with a junction — npm cannot install through one.

## Licence

MIT
