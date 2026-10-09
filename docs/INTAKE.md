# How mail gets in: everything we have, every route considered, and what is still open

Written 2026-10-09, at Andrei's request, to think with. **Nothing here is a proposal to build
immediately** — §8 lists the decisions, and §7 the research that is still missing.

## The criteria

Three requirements, in his words, that everything below is measured against:

1. **Generalizable** — works for the next person, not just this machine.
2. **Easy to set up for a new user** — the person who needs this is a project manager, not an
   operator.
3. **Email-provider agnostic** — nobody should have to be on Gmail, or on Microsoft, or on anything in
   particular.

They are not equally easy to satisfy, and §5 shows where they fight each other.

## 1. What exists today

| Piece | State | What proves it |
|---|---|---|
| Spool: raw `.eml` + append-only index + per-account cursor, under `<agent dir>/mail/<account>/` | Built | 17 checks, and real files on disk from live runs |
| Fetcher: one pass per account, dedup, provider-owned cursor, one broken account does not stop others | Built | Runs from a plain node process with no pi (verified) |
| **IMAP source** — a mailbox the agent owns | Built | 21 checks against a stubbed server, including a `uidValidity` rebuild and a dropped connection |
| Graph source — read a Microsoft mailbox directly | Built | 12 checks against a stubbed Graph; **never run against Microsoft** (no tenant exists) |
| Microsoft sign-in (device code) | Built | 16 checks against a stubbed identity platform; reached the live endpoint once, with a placeholder client id |
| Wake: every message turns the agent, pointer not digest, quarantine on links and attachments | Built | 24 checks, and **proven live**: agent settled at 3.6s, message spooled at 13.1s, turn started with no prompt at 13.4s |
| `/email-watch` (per-session, opt-in), `/email-service` (start/stop/status), `/email-setup` (wizard) | Built | 18 checks on the wizard conversation, 10 on a real detached service process |
| Detached always-on service | Built | Started, fetched, logged, stopped — one process only |
| **A real mailbox** | **Never done** | Everything above is either stubbed or fixture mail |

**121 checks across seven suites, all offline.** The missing step is the one thing no test can
substitute for: a real address, a real password, a real message.

### The decisions that constrain everything downstream

- **No gate.** Every message turns the agent. Re-confirmed knowing a cc'd thread is one turn per reply.
- **No send path, ever.** Replies stay a human act from the human's own address. This is a boundary,
  not a backlog item — and it is what keeps incoming-only mail free on Cloudflare (§4, R5).
- **The agent has an address of its own** (the front door). You cc it or forward to it; it does not
  read your inbox.
- **Watching is opt-in per session**, and the fetcher may be always on independently of that.

## 2. The problem, stated plainly

The user's *provider* was never the hard part. Access is.

Anything that reads a mailbox programmatically needs a credential the provider is willing to issue to
a third-party program. Every route we have tried runs into a wall, and the walls are not technical —
they are policy:

| Wall | Where it bit us |
|---|---|
| An app registration must live in a tenant | A personal outlook.com account cannot create one at all |
| A tenant admin must consent | Corporate Microsoft mailboxes, even for Mozilla's own client |
| App passwords may simply not be offered | Andrei's new agent Gmail, cause not established |
| Basic auth was removed | Outlook.com IMAP; Exchange Online IMAP |
| The client's local store is a cache | Thunderbird syncs the inbox reliably and other folders only sometimes |

The pattern: **the closer the design gets to "read somebody's real mailbox", the more policy stands in
the way.** Which is why the agent having its own address was the right turn — and why the remaining
question is only *where that address lives and how the agent gets the mail back out of it*.

## 3. Every route, with what it actually costs

Ordered from "reads the user's mailbox" to "nothing to do with a mailbox at all".

**R1 — Read the user's own Microsoft mailbox (Graph).** One adapter exists. Needs an Entra app
registration, and in a company an administrator's consent. Personal Microsoft accounts cannot even
register the app. *Wall: consent.*

**R2 — Read the user's own mailbox over IMAP.** Microsoft removed basic auth (app passwords included),
so this is OAuth for them. For Gmail it needs an app password, which Google may refuse — as it did on
Andrei's agent account with 2-Step Verification properly on. *Wall: provider policy; not diagnosable
from outside.*

**R3 — Read the user's mail client's local store.** No registration at all. But it only sees what that
client synced, on that machine; Thunderbird users report non-inbox folders staying server-side even
with offline sync on; the store is an internal mbox plus a Mork index; and Outlook's COM equivalent is
unsupported in new Outlook and ceases with classic. *Wall: coverage and longevity.*

**R4 — A mailbox we chose, read over IMAP.** Works today, needs no new code. Setup = pick a host, make
an app password. Cheapest hosts that sell this on purpose: ForwardEmail **$3/month** (10 GB, API
access, unlimited domains — its own pricing page says the *free* tier forwards but stores nothing, so
free is not enough here), Migadu, mailbox.org, Purelymail, Fastmail. *Wall: someone else's policy
still, but a policy that exists because they sell this — and a small monthly cost.*

**R5 — Own the drop.** Cloudflare Email Routing → Worker → KV, pulled locally over the REST API with a
scoped token. **Inbound routing is unlimited and free** on the Workers free plan; what is metered is
*sending*, which this package never does. Nothing to revoke: it is the user's zone and their token.
Subdomains of an existing zone can be used, apex by default. *Wall: setup only a technical person can
do — a domain, a Worker, KV, a routing rule, a token. Plus one more adapter.*

**R6 — An email-to-API service** (Zapier Email Parser, Mailparser and similar). These hand you an
address to forward to and expose an API — no domain, no DNS. *Walls: small free quotas, correspondence
passing through a third party's parser, and the user still has to forward, so it is the forwarding
route wearing a different hat.*

**R7 — Gmail API with OAuth.** Self-service in the sense that no tenant is involved, but the consent
screen in **Testing** status issues refresh tokens that expire in **seven days** (Google's own OAuth
documentation), and publishing to **Production** as an external app brings verification requirements —
branding, a homepage on a verified domain, a privacy policy (Google's branding page). *Wall: it
solves nothing and adds a weekly re-auth.*

**R8 — Not email at all.** A Telegram bot, a local HTTP endpoint, a file drop. Setup is trivial and no
provider can object. *Wall: the premise — colleagues use email, and asking them to install a bot is a
different product.*

## 4. The axes that actually decide it

| Route | Who owns the address | Credential | Who must approve | Setup for a non-technical person | What can revoke it | Cost |
|---|---|---|---|---|---|---|
| R1 Graph | The user's employer | OAuth app registration | A tenant admin | Impossible alone | IT policy | free |
| R2 IMAP on their mailbox | The user | App password or OAuth | The provider (sometimes refuses) | 5 minutes, if allowed | Provider policy | free |
| R3 Client store | The user | none | Nobody | Install a client, sign in | A client's format change | free |
| R4 A chosen mailbox | The user | App password | Nobody but the host | 10 minutes | Host policy | $3+/mo |
| R5 Own the drop | The user | A scoped API token | Nobody | An afternoon (technical) | **Nobody** | free, or $10/yr for a domain |
| R6 Parser service | The service | An API key | Nobody | 10 minutes | The service | free tier, tiny |
| R7 Gmail API | The user | OAuth | Google (verification) | 20 minutes + weekly re-auth | Google | free |
| R8 Bot/HTTP | The user | A token | Nobody | 2 minutes | Nobody | free |

Two things fall out of that table:

- **R5 is the only row where nothing can be revoked and nothing must be approved** — and the only row
  whose setup cost is measured in skill rather than minutes.
- **The easy-setup rows (R2, R4, R6, R8) all rent their address from someone whose terms can change**,
  which is exactly what has cost us a day of Google's opacity.

## 5. Where the criteria fight

- **Generalizable + easy** points at a rented address (R4/R6) — quick, but the middle of the table
  shows the risk we just lived through.
- **Generalizable + irrevocable** points at R5 — but it fails "easy" for the person this is being built
  for, who will not deploy a Worker.
- **All three at once** is satisfiable only if either the setup becomes scriptable (§6, C2) or the
  addressing becomes someone else's job (§6, C3).

## 6. Combinations worth thinking about

**C1 — Support both landings, let the config choose.** IMAP for anyone with a mailbox; the drop for
anyone who wants independence. *This is already almost done* — three providers behind one two-call
seam. It satisfies "generalizable" and "agnostic" by refusing to pick a winner.

**C2 — One-command drop.** The setup command deploys the Worker, creates the KV namespace, adds the
routing rule and mints the token **through Cloudflare's API**, from a single account token the user
pastes. Setup becomes: sign into Cloudflare, paste a token, answer two questions — the same shape as
the Gmail path that failed, but with no provider that can refuse. This is the most promising synthesis
of the three criteria, and it is a **small** extension of what exists: a Worker source (~an afternoon)
plus the API calls the wizard already knows how to make. *Unverified: whether every one of those steps
— script deployment, KV namespace creation, routing rules — is available to a scoped account token
rather than a dashboard click.*

**C3 — We host the drop.** One domain, an address per user, a token per agent, trivial setup: "here is
your address". The only route where setup for a non-technical user is genuinely nothing. The cost is
not technical: running a mail service means holding other people's correspondence, handling abuse, and
answering to privacy rules. **That is the line between a tool and a business**, and it is the single
biggest fork in this document.

**C4 — Forwarding as the universal adapter** (already in place). Whatever the landing is, a
correspondent or the user sends mail to the agent's address and never needs to know how it gets read.
This is what makes C1 and C3 swappable later without changing anything a client sees.

## 7. Research still missing

1. **Can the whole Cloudflare drop be provisioned by API with one scoped token** (C2)? Decisive for
   whether the hard route can be made easy. Not verified.
2. **Does ForwardEmail's paid tier really offer IMAP with an app password** (R4)? Their page says
   storage and API; the protocol is not named. Not verified.
3. **Why did Google refuse app passwords for that account** — new account, Workspace, unreported
   policy change? Two searches failed to find a documented cause, which is itself a finding.
4. **What Cloudflare does with spam and abuse** on routed mail: does it filter, reject, or hand us
   everything?
5. **Cost and duty of hosting for others** (C3): what operating an inbound mail service for third
   parties actually requires, legally and operationally.
6. **Whether the person who needs this would accept any of the non-trivial setups** — the honest
   question behind the "easy" criterion, and one only Andrei can answer.

## 8. Decisions this document is asking for

1. **Which landing does the product stand on?** (R4 a chosen mailbox / R5 own the drop / C3 we host
   it) — or C1, both, chosen per user.
2. **Is it a tool or a service?** Local tool with a technically demanding setup, or a hosted service
   where setup is an address in a box. C3 is the second; everything built so far is the first.
3. **Do we invest in C2** — the one-command drop — as the default onboarding, on the grounds that it is
   the only path that is agnostic *and* irrevocable without us becoming a mail provider?
4. **What does "easy" have to mean for the person you are building this for** — finish a wizard in five
   minutes, or be handed a working address?
