# Wiki Log

## [2026-10-09] finalize | Initialized the project wiki with the four pages that exist as knowledge: the spool-and-wake architecture with its module map and invariants, the decisions (no gate, pointer payload, opt-in /email-watch, quarantine, personal Gmail as test target), and two gotchas found while building — the node_modules junction blocking npm install and therefore CI, and a mail turn feeding third-party text into wiki capture.
- Updated: architecture/architecture-spool-and-wake.md
- Updated: decisions/decision-no-gate-and-pointer.md
- Updated: gotchas/gotcha-junction-blocks-npm-install.md
- Updated: gotchas/gotcha-mail-turn-meets-capture.md

## [2026-10-09] remove | 1 page(s)
- Reason: Obsolete: the junction is gone. On 2026-10-09 the repo replaced it with a real npm install (124 packages, lockfile) and installed into pi from the local path, so the page's claims — node_modules is a junction, CI cannot run npm ci — are now false. The durable part, that a junction into the pi install cannot be installed into and how to remove it safely, has been merged into the home wiki's procedures/decision-symlink-dev-tooling.md, where it belongs with the rest of the dev-symlink guidance.
- Removed: gotchas/gotcha-junction-blocks-npm-install.md

## [2026-10-09] finalize | Updated to match the day's work: the Graph source page is new (Outlook first, delta bounded by a date, MIME through $value, device code sign-in, one client id per account and what that means for another tenant's consent), the architecture page gained the cursor-ownership invariant and the live wake proof and lost its stale provider list, and the junction gotcha page was removed as obsolete — the repo now installs for real and loads into pi from the local path.
- Updated: architecture/architecture-spool-and-wake.md
- Updated: architecture/microsoft-graph-source.md
- Updated: decisions/decision-no-gate-and-pointer.md

## [2026-10-09] finalize | Added the offline proof of the sign-in state machine and the two live contacts with Microsoft's endpoint (an AADSTS50059 for a placeholder client id, which shows the request shape is accepted, and the actionable error when no sign-in is stored). The remaining unproven step is a real app registration and consent.
- Updated: architecture/microsoft-graph-source.md

## [2026-10-09] finalize | Recorded the wall Andrei hit: a personal Microsoft account cannot register an app, because app registrations live in an Entra tenant and outlook.com accounts are routed to 'Microsoft Services' without being members. Since basic authentication against Outlook.com is gone too, IMAP would need the same registration — so every route into a Microsoft mailbox begins with a work or school account in a tenant. The README now says so before the setup steps.
- Updated: architecture/microsoft-graph-source.md

## [2026-10-09] finalize | Added the checked answer to Andrei's question about hooking a user's own mail client: it does not avoid the tenant wall. Outlook COM automation is unsupported in new Outlook and ceases with classic Outlook, with no replacement for external desktop processes; Thunderbird's own users hit 'need admin approval'; Thunderbird's maildir store is incomplete and off by default. The route that does survive: an app registered in any tenant, allowing personal Microsoft accounts, can be authorised by a personal outlook.com mailbox with the user's own consent — so the test account still works.
- Updated: gotchas/gotcha-microsoft-mailbox-access.md

## [2026-10-09] finalize | Answered whether a local client makes this more general, and the answer is sharper than expected: a client store generalises across providers but not across machines, because it only ever sees what that client synced — Thunderbird users report folders other than the inbox staying server-side even with offline sync enabled, and the store is an internal mbox plus Mork index. Recorded alongside the wall, with the two routes' opposite failure modes.
- Updated: gotchas/gotcha-microsoft-mailbox-access.md

## [2026-10-09] finalize | Checked and recorded the agent-address route Andrei proposed: it is the only intake model with no app registration, no tenant and no consent, because the mailbox read is one its owner controls — and Gmail app passwords still work for IMAP, so that mailbox needs no OAuth either. It also makes the sender's provider irrelevant, so one adapter replaces one-per-provider. The two costs recorded alongside: external auto-forwarding is off by default in Exchange Online tenants created since 2021 (so a corporate user may be down to manual forwarding), and a forward rewrites the envelope while cc'ing preserves it.
- Updated: gotchas/gotcha-microsoft-mailbox-access.md

## [2026-10-09] finalize | Recorded the pivot Andrei proposed: the front door is now an address the agent owns, read over IMAP, because it is the only route with no app registration, no tenant, no consent and no client — and because it makes the sender's provider irrelevant, so one adapter covers everything. Also recorded that each agent gets its own new Gmail, and that the no-gate decision was re-confirmed knowing a cc'd thread turns the agent once per reply. Architecture and gotcha pages updated to match.
- Updated: decisions/decision-no-gate-and-pointer.md
- Updated: architecture/architecture-spool-and-wake.md
- Updated: gotchas/gotcha-microsoft-mailbox-access.md

## [2026-10-09] finalize | Added the reconnect property of the IMAP source (a failed operation drops the client so the next pass reconnects, and the error still surfaces) with its four checks as evidence, and narrowed the "not built yet" list to what is genuinely missing: backoff between passes, a reply path, catch-up reporting, and a deeper forward-header parser.
- Updated: architecture/architecture-spool-and-wake.md

