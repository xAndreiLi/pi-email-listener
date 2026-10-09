# architecture

| Page | Type | Tags | Summary | Updated |
|------|------|------|---------|---------|
| [Two halves joined by a spool: the fetcher fills files, the session reads them](../architecture/architecture-spool-and-wake.md) | architecture/layer | architecture spool pi-extension wake oauth fetcher | pi-email-listener is a standalone fetcher that owns the mailbox connection and writes .eml files plus an append-only index under the agent directory, and an in-session pi extension that reads that spool and turns the agent. The split exists because a wake can only be sent from inside the session being woken, while the fragile half — OAuth, reconnect, sync position — must outlive pi restarts. | 2026-10-09 |
