# Wiki TOC

> 5 pages across 3 topics. Per-topic tables: `toc/<topic>.md`. Full machine index: `index.md`.

| Topic | Pages | Table |
|-------|-------|-------|
| architecture | 2 | [toc/architecture.md](toc/architecture.md) |
| decisions | 1 | [toc/decisions.md](toc/decisions.md) |
| gotchas | 2 | [toc/gotchas.md](toc/gotchas.md) |

## Recently updated
- [Outlook through Microsoft Graph: delta bounded by a date, MIME for the message, device code for the sign-in](architecture/microsoft-graph-source.md) — The Microsoft source reads a folder with a delta query bounded by receivedDateTime, fetches each message as MIME through $value, and signs in once with the device code flow — no client secret, no redirect URI, and the refresh token stored beside the spool. The client id is per account, so somebody else's mailbox can run under their own Entra app and their own consent. (2026-10-09)
- [Two halves joined by a spool: the fetcher fills files, the session reads them](architecture/architecture-spool-and-wake.md) — pi-email-listener is a standalone fetcher that owns the mailbox connection and writes .eml files plus an append-only index under the agent directory, and an in-session pi extension that reads that spool and turns the agent. The split exists because a wake can only be sent from inside the session being woken, while the fragile half — OAuth, reconnect, sync position — must outlive pi restarts. Providers plug in through two calls, and the sync cursor belongs to the provider. (2026-10-09)
- [No gate, a pointer not a digest, and watching only when asked](decisions/decision-no-gate-and-pointer.md) — pi-email-listener turns the agent for every message — no relevance gate, no batching, no suppression rules — and the wake carries the sender, the subject and a file path rather than the body. Watching is opt-in per session through /email-watch. A message with a link or attachment turns the agent with bash, edit and write blocked until the turn ends. (2026-10-09)
- [A mail turn meets wiki capture](gotchas/gotcha-mail-turn-meets-capture.md) — A message delivered by a wake is read by the agent, so its text is in the transcript — and wiki capture snapshots the transcript. A session watching mail therefore feeds third-party mail into whichever wiki captures that session, including this one, unless capture is off for it. The extension says so when watching starts. (2026-10-09)
- [Getting at a Microsoft mailbox: what works, what is a dead end, and the one trick that saves a personal account](gotchas/gotcha-microsoft-mailbox-access.md) — Every route into a Microsoft mailbox is an OAuth app registration inside a tenant — including the routes that look like they avoid one. Hooking the user's own mail client does not dodge the wall, it moves it: Outlook's COM automation is explicitly unsupported and dying, and a third-party client faces the same tenant consent policy. The useful exception: an app registered in any tenant, configured to allow personal Microsoft accounts, can read a personal outlook.com mailbox with the user's own consent. (2026-10-09)
