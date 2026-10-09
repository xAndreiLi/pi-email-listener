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

