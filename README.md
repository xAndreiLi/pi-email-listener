# pi-email-listener

**Status: M2 built — the fetcher, the spool, and the wake. Verified offline; not yet run against a
real mailbox, and the live wake test has not been run.** The design is agreed and written up in
[`docs/PLAN.md`](docs/PLAN.md).

The ears. A [pi](https://pi.dev) package that watches a mailbox and turns the agent when mail
arrives, handing over **a pointer to the message** — who, what, when, and the file to read — never a
summary of it. The agent opens the message itself.

Sibling to [pi-job-listener](https://github.com/xAndreiLi/pi-job-listener), which does the same for
long-running processes. It inherits the pointer rule and deliberately drops the gate: there, the
ambiguous question is whether a process's middle output is worth interrupting for; here, every
message turns the agent.

## How it is put together

```
mailbox ──▶ fetcher (always on, no pi) ──▶ spool of files ──▶ extension in a session ──▶ turn
             OAuth, reconnect, catch-up      .eml + index      opt-in per session
```

The fetcher owns the fragile half — connection, tokens, reconnect, sync position — and its only
output is files, so it runs with or without a session and is testable with no network. The extension
owns the wake. Nothing wakes an agent by surprise: a session is only turned by mail once the user has
set that up in it.

## What works today

- Reads a mailbox through a `MailSource`: `listNew(cursor)` and `fetch(id)`. The only source so far
  is `fixture`, a directory of `.eml` files — enough to watch the spool fill with no credentials.
- Stores every new message as a raw `.eml` plus an append-only `index.jsonl` line, per account,
  under `<agent dir>/mail/<account>/`, with the source's own cursor in `cursor.json`.
- Re-runs are safe: message ids already in the index are not stored twice, and the cursor means a
  restart resumes rather than re-reads. One broken account does not stop the others.
- **`/email-watch` turns a session on to mail** (and the same command turns it off). Nothing is
  watched until you ask: no session is turned by mail by surprise. Messages that arrived while
  nothing was watching are delivered when you turn it on.
- Every message turns the agent — there is no gate. The wake is a pointer: sender, subject, time,
  account and the file to read. Never the body.
- A message carrying a **link or an attachment** quarantines its turn: `bash`, `edit` and `write`
  are refused until the turn ends, so the agent can report a stranger's mail but cannot act on it
  unattended. Other tools, including `read`, still work.
- A second message arriving mid-turn queues behind it; every message still gets its own turn.

## Try it

```bash
npm run test:all     # 17 spool/fetcher checks + 24 extension checks, no network, no session
```

`scripts/live-test.mjs` drives a real pi over RPC, settles the agent, then drops a message into the
spool and watches for a turn with no prompt behind it. That is the only test that proves pi accepts
the wake — and it spawns a session and costs a model call, so it is run deliberately:

```bash
node scripts/live-test.mjs
```

For local development, `node_modules` is a junction to your pi install, as in pi-job-listener:

```
mklink /J node_modules <pi install>\node_modules
```

Do **not** run `npm install` while that junction is in place — npm would write into the pi install
it points at. The package resolves its own dependencies from what pi already provides.

To watch it run against a directory of exported `.eml` files, write
`<agent dir>/pi-email-listener.json`:

```json
{
  "accounts": [{ "name": "test", "provider": "fixture", "dir": "C:/path/to/eml-files" }],
  "pollSeconds": 30
}
```

then `npm run fetch` (poll forever) or `npm run fetch:once` (one pass). Both paths can be moved for a
test with `PI_EMAIL_LISTENER_CONFIG` and `PI_EMAIL_LISTENER_MAIL_DIR`.

`PI_EMAIL_LISTENER_AUTOSTART` starts watching without `/email-watch`, for a session that should
always be woken — and for the RPC test, which cannot type a command.

A real mailbox needs an OAuth2 provider adapter, which is M3 — and the first live account is
Andrei's own, connected by him.

## Outlook (Microsoft Graph)

Outlook, Outlook.com and Microsoft 365 are read through Microsoft Graph. You need an app
registration once — nobody else can do this for you, and the package never sees the sign-in.

> **An app registration lives in a Microsoft Entra tenant, and a personal outlook.com or hotmail.com
> account is not in one.** Signing in to the Entra portal with a personal Microsoft account fails
> with "Selected user account does not exist in tenant 'Microsoft Services'" — Microsoft routes
> personal accounts to that tenant, and they are not members of it, so they cannot register an app
> or create a tenant from there. Use a work or school account (an organisation's tenant, with at
> least the Application Developer role), or a tenant of your own. There is no way around it: email
> apps can no longer use basic authentication against Outlook.com either, so IMAP needs the same
> OAuth app registration. If you do not have a tenant, someone in your organisation does, and their
> IT is the one to ask.
>
> **The tenant that registers the app does not have to be the mailbox's tenant.** An app registered
> in any tenant, with supported account types set to include personal Microsoft accounts, can be
> authorised by a personal outlook.com mailbox — that user consents for themselves, with no
> administrator involved. So a test address on outlook.com is still usable: it needs *a* tenant to
> register the app, not its own.
>
> **Expect an administrator for a corporate mailbox.** Third-party mail clients are subject to the
> same tenant policy — Thunderbird's own users have been met with "need admin approval" — and
> Microsoft's default consent policy for Exchange-related Graph permissions is being tightened to
> require admin consent unless an app is approved by the tenant's mail client policy.

1. Go to <https://entra.microsoft.com> → **App registrations** → **New registration**.
2. Name it anything, and set **Supported account types** to "Accounts in any organizational
directory and personal Microsoft accounts" — that covers a work mailbox and an outlook.com one.
3. Under **Authentication → Advanced settings**, set **Allow public client flows** to **Yes**. The
device code flow does not work without it, and there is no redirect URI to create.
4. Under **API permissions**, add **Microsoft Graph → Delegated → `Mail.Read`**. Do not add
`offline_access`; it is requested at run time and is what buys the refresh token.
5. Copy the **Application (client) ID** into the account in `<agent dir>/pi-email-listener.json`:

```json
{
  "accounts": [
    {
      "name": "work",
      "provider": "graph",
      "clientId": "<application (client) id>",
      "tenant": "common",
      "mailbox": "me",
      "folder": "inbox",
      "since": "2026-10-09T00:00:00Z"
    }
  ],
  "pollSeconds": 30
}
```

`since` is where the first sync starts. It exists so a first run does not copy an entire mailbox to
disk — set it to now, or to whenever you want the record to begin.

Then, once per account:

```bash
npm run mail:auth work   # prints a code to enter at microsoft.com/devicelogin
npm run fetch            # or fetch:once
```

The refresh token is stored beside the spool for that account, so the fetch needs no further
sign-in. `mail:auth` again replaces it.

**A corporate mailbox** may need consent before any of this works: if the tenant does not let users
consent to apps themselves, an administrator grants it once under **Enterprise applications** → the
app → **Permissions** → **Grant admin consent**. For a mailbox in someone else's tenant it is usually
better that they register their own app and use their own `clientId` — the package supports one per
account, and that keeps their IT in charge of their own consent.

## A real mailbox needs a real dependency tree

This repository installs its own dependencies (`npm install`), so `node_modules` is a normal
install. Earlier it was a Windows junction into the pi install, which worked for imports but meant
npm could never be run; if you recreate that junction, you cannot install anything.

## Licence

MIT
