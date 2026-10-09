# pi-email-listener

**Status: M1 built — the fetcher and the spool. No wake yet.** The design is agreed and written up
in [`docs/PLAN.md`](docs/PLAN.md); what exists today is the half that talks to a mailbox. Nothing
here has been pointed at a real mailbox.

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
  restart resumes rather than re-reads.
- One broken account does not stop the others.

## Try it

```bash
npm run self-check   # 17 assertions, no network, no credentials, no session
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

A real mailbox needs an OAuth2 provider adapter, which is M3 — and the first live account is
Andrei's own, connected by him.

## Licence

MIT
