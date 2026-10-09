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

## [2026-10-09] finalize | Recorded the three decisions from this turn — always-on as a detached process (with its deliberate limit: not an OS service, so a reboot still stops it), the agent never sending mail as a boundary rather than a backlog item, and setup as a guided command that opens the pages a person needs and verifies before writing. Added the service and the wizard to the architecture page's module map and the command surface alongside it.
- Updated: decisions/decision-no-gate-and-pointer.md
- Updated: architecture/architecture-spool-and-wake.md

## [2026-10-09] finalize | Recorded the Gmail trap Andrei hit while setting up the agent mailbox: a passkey-only second factor makes the app-passwords page answer "the setting you are looking for is not available for your account", which reads like a policy refusal and is really a missing compatible second step. Also recorded the two escapes — a different IMAP host, which needs no code because the wizard already offers it, and the Gmail API with its testing-mode token expiry.
- Updated: gotchas/gotcha-gmail-app-password.md

## [2026-10-09] finalize | Corrected a claim I filed an hour earlier: the passkey-only explanation for Gmail refusing app passwords is refuted, since Andrei's agent account has both a phone number and a passkey and the page still refuses. The page now says the cause is not diagnosable from outside, that the consequence is what matters (that account cannot be read), and that the way out is a host that sells IMAP. Also corrected the Gmail API from "the other escape" to what it is: Testing-status consent screens issue refresh tokens that expire in seven days, per Google's own documentation.
- Updated: gotchas/gotcha-gmail-app-password.md

## [2026-10-09] finalize | Checked whether the agent's mailbox could be something we run rather than another provider's, and recorded the verified shape: a mail server on the user's own machine cannot be the receiving end (public MX, port 25, and mail bounced by downtime lands on the sender days later), but a Cloudflare domain with Email Routing pointed at a Worker that stores raw mail in KV — pulled locally over the REST API with a scoped token — is free, unlimited inbound, and revocable by nobody. Also recorded the honest cost: setup only a technical person can do, one more adapter, and that hosting it for others would mean running a mail service.
- Updated: architecture/owning-the-drop.md

## [2026-10-09] finalize | Added the pattern behind every wall we have hit — policy rather than protocol, getting taller the closer a design sits to reading somebody's real mailbox — with the four incidents as evidence. Also recorded the two alternatives researched while writing the briefing: ForwardEmail's free tier forwards but stores nothing so it means their paid tier, and the Gmail API's choice between seven-day tokens in Testing and verification requirements in Production. The repository now carries docs/INTAKE.md, the full briefing written for Andrei to think with.
- Updated: architecture/owning-the-drop.md

## [2026-10-09] capture | 9 insights (tool)
- Raw: raw/sessions/2026-10-09-session-2026-10-09-080256.md
- Filed 0 · reinforced 1 · review 3 · rejected 5

## [2026-10-09] capture | 5 insights (tool)
- Raw: raw/sessions/2026-10-09-session-2026-10-09-080352.md
- Filed 2 · reinforced 0 · review 0 · rejected 3

## [2026-10-09] finalize | Researched one-click setup for INTAKE.md. Answers to §7 Q1 (wrangler 4.113 creates routing rules and storage from one deploy; zone onboarding still needs Zone Settings Write, a dashboard click), Q2 (ForwardEmail speaks IMAP but needs a domain) and Q4 (Cloudflare rejects failed auth and RBL senders, no spam filter). New route: AgentMail's agent sign-up, a receive-only inbox the package can create itself, readable by the existing IMAP source. New gotcha: the npm-installed package cannot start its fetcher (three verified blockers; pi-jev-wiki's jiti launcher is the fix pattern). Apps Script recorded as a Gmail fallback.
- Updated: architecture/owning-the-drop.md
- Updated: architecture/agentmail-agent-inbox.md
- Updated: gotchas/gotcha-npm-install-cannot-start-fetcher.md
- Updated: gotchas/gotcha-gmail-app-password.md

## [2026-10-09] capture | 8 insights (tool)
- Raw: raw/sessions/2026-10-09-session-2026-10-09-082544.md
- Filed 0 · reinforced 3 · review 1 · rejected 4

## [2026-10-09] finalize | AgentMail proven live and set up on Andrei's machine: suruiling@agentmail.to signed up receive-only, the existing IMAP source logged in and ran an empty first pass, and an unclaimed agent org reports 1 inbox and 0 domains. Sending limits recorded for Andrei's question. npm-install blockers fixed (src/daemon.mjs via jiti; only extension.ts imports pi), proven red to green in the installed shape and guarded by self-check (125 checks). Recorded Andrei's calls: AgentMail is 'a great solution', and INTAKE.md stays an artifact. Also fixed a fused c6/c7 line in the decisions page frontmatter.
- Updated: architecture/agentmail-agent-inbox.md
- Updated: gotchas/gotcha-npm-install-cannot-start-fetcher.md
- Updated: architecture/architecture-spool-and-wake.md
- Updated: decisions/decision-no-gate-and-pointer.md

## [2026-10-09] lint | 0 added, 0 broken links, 42 unbacked claims
- Pages: 9
- TOC updated: 0 · missing files: 0
- Orphans: 0 · raw backlog: 0
- Contradiction checks: 0 · duplicate candidates: 0

## [2026-10-09] capture | 3 insights (tool)
- Raw: raw/sessions/2026-10-09-session-2026-10-09-084215.md
- Filed 1 · reinforced 0 · review 0 · rejected 2

## [2026-10-09] finalize | AgentMail wired into /email-setup as the first choice: receive-only sign-up, INBOX and Spam accounts written before the login check because the key cannot be fetched again, a rescue file if the config cannot be written, and an existing address named before a second is made (140 checks). Andrei's machine readied for testing: suruiling and suruiling-spam, outlook removed, service off. Andrei's call recorded: commit everything as is, the address included.
- Updated: architecture/agentmail-agent-inbox.md
- Updated: decisions/decision-no-gate-and-pointer.md
- Updated: architecture/architecture-spool-and-wake.md

