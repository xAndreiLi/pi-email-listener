# pi-email-listener

**Status: the front door, the setup wizard and the always-on service are built.** A mailbox the agent
owns is read over IMAP, every message turns the agent in a pi session, and the wake is a pointer
rather than a summary. `/email-setup` gives the agent an address of its own in one step, or walks a
person through connecting a mailbox they have. Verified offline and live against pi over RPC, and the
login and a first pass have run against a real AgentMail inbox. A real message arriving is the next
thing to prove.

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

In a pi session, run **`/email-setup`** and pick **Give the agent its own address**. Type a name, and
the agent has `<name>@agentmail.to` on the spot — no sign-up, no card, no password to make. The
wizard checks the login and offers to keep the fetcher running in the background.

What that address is:

- **Receive-only.** It is created with no human attached, so [AgentMail](https://agentmail.to) itself
  refuses to send from it — on top of this package having no send path at all.
- **Its key is the inbox.** The key is written to `<agent dir>/pi-email-listener.json` and nowhere
  else, and AgentMail cannot recover it. Claiming the inbox at <https://console.agentmail.to/claim>
  makes it recoverable, and also lets it send — so only if you want that.
- **Two folders are watched**, the inbox and AgentMail's Spam folder, so a message filtered as spam
  still reaches the agent.
- **Free.** AgentMail's free tier, no card. An account nobody has claimed holds one inbox.

Prefer a mailbox of your own? The same command sets up a new Gmail — it opens the signup and
app-password pages, and needs 2-Step Verification on — or any IMAP mailbox with a password. Either
password is typed into the terminal, so it is visible while you type it, and is written to the same
file and nowhere else.

Then ask someone to cc the agent, or forward it a message, and run `/email-watch` in the session that
should be woken.

Doing it by hand instead is fine — the same file, the same fields:

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
  "pollSeconds": 30,
  "service": { "autoStart": true }
}
```

`password` works too, but `passwordEnv` names an environment variable instead of storing it in the
file. The mailbox is never modified: nothing is marked read, moved or deleted.

## Always on

`service.autoStart` means any session that starts will make sure the background fetcher is running, so
mail keeps arriving with no terminal open and no session watching. It is the same process either way:

| | |
|---|---|
| `/email-service` | report what is running, and the last thing it said |
| `/email-service start` | start it if it is not running |
| `/email-service stop` | stop it |
| `npm run fetch` | the same fetcher in the foreground, for watching it work |

Its state is one file, `<mail dir>/service.json`, and its output is `<mail dir>/service.log`. Starting
it twice does not start a second one.

What it is **not**: an operating-system service. It outlives the session that started it, but not a
reboot. Surviving a reboot needs a Windows scheduled task or a systemd unit, which is a piece of work
nobody has needed yet.

## What the agent will not do

The agent never sends mail. There is no send path, and that is a decision rather than a gap: replies
stay a human act, from the human's own address, which is the one thing that keeps an agent's
mistakes recoverable. It also decides how a stranger's message is treated — a turn triggered by mail
with a link or an attachment cannot reach `bash`, `edit` or `write`.

## What works today

- **Sources**: `imap` (a mailbox the agent owns — the front door, including the AgentMail address
  `/email-setup` creates), `graph` (read your own Microsoft
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
npm run test:all   # offline: spool and fetcher, the extension against a stub pi API, Graph against a
                   # stubbed Graph, sign-in against a stubbed identity platform, IMAP against a
                   # stubbed server, the setup wizard against a stubbed conversation, and the service
                   # actually started and stopped. No credentials, no network.
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

## Thinking it through

[](docs/INTAKE.md) lays out every route mail could take into an agent — what each one
costs, who has to approve it, and what can revoke it — plus the open research questions. Written to
be thought about rather than acted on.

## Licence

MIT
