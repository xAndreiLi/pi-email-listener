---
title: "Installed from npm, the background fetcher could not start (fixed 2026-10-09)"
type: gotcha
topic: gotchas
summary: "An npm-installed copy loaded the extension but could not start the detached fetcher, for three independent reasons: scripts/ was not published, Node refuses to strip types under node_modules, and plain node cannot resolve the pi peer that config.ts and spool.ts imported at top level. It only ever worked on Andrei's machine because pi loads this checkout. Fixed the way pi-jev-wiki does it: src/daemon.mjs loads the fetcher through jiti, nothing but the extension imports pi, and the extension hands pi's agent directory to the rest. Proven from a real npm-style install with no pi peer, and guarded by self-check."
tags: [gotcha, npm, install, service, jiti, type-stripping, distribution]
updated: 2026-10-09
sources: ["raw/sessions/2026-10-09-session-2026-10-09-080256.md", "raw/sessions/2026-10-09-session-2026-10-09-082544.md"]
files:
  [
    C:/Coding/pi-email-listener/package.json,
    C:/Coding/pi-email-listener/src/service.ts,
    C:/Coding/pi-email-listener/src/config.ts,
    C:/Coding/pi-email-listener/src/spool.ts,
    C:/Coding/pi-email-listener/src/daemon.mjs,
    C:/Coding/pi-email-listener/src/extension.ts,
    C:/Coding/pi-email-listener/scripts/self-check.ts,
  ]
claims:
  - id: c1
    text: "Until the fix in c2, an npm-installed copy of this package could not start its background fetcher, for three independent reasons verified on 2026-10-09. (1) package.json `files` publishes src/ but not scripts/, where the fetcher's entry (scripts/fetch.ts, spawned by src/service.ts) lives. (2) Node refuses to strip types for any file under node_modules, which is where pi puts npm packages. (3) A plain node process cannot resolve the peer @earendil-works/pi-coding-agent from a genuine pi npm install, yet src/config.ts and src/spool.ts import getAgentDir from it at top level. It works on Andrei's machine only because pi loads the package from the C:/Coding/pi-email-listener checkout, which has the devDependency installed. pi-jev-wiki solved the same problem with a plain-JavaScript daemon.mjs that loads its TypeScript through jiti and receives the agent directory as an argument."
    status: verified
    support: 0.9
    evidence: ["command: node --experimental-strip-types <tmp>/node_modules/demo/a.ts → 'Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is currently unsupported for files under node_modules'; the same file outside node_modules printed 'ran 1' (node v22.23.2)", "command: from ~/.pi/agent/npm/node_modules/@dietrichgebert/ponytail (a real npm install), import.meta.resolve('@earendil-works/pi-coding-agent') → ERR_MODULE_NOT_FOUND; ~/.pi/agent/npm/node_modules/@earendil-works/ is empty", "command: the same resolve from pi-jev-wiki's install directory succeeded only because that entry is a junction to C:/Coding/pi-jev-wiki, resolving to its devDependency — a dev-machine artefact, not an install", "file: package.json — \"files\": [\"src\", \"README.md\", \"LICENSE\"]", "file: src/service.ts — const entry = join(dirname(fileURLToPath(import.meta.url)), \"..\", \"scripts\", \"fetch.ts\"); spawn(process.execPath, [\"--experimental-strip-types\", entry], …)", "file: C:/Coding/pi-jev-wiki/src/vector/embedder/daemon.mjs — 'Node refuses to strip TypeScript types for files under node_modules, so an installed copy of this package cannot be started with node .../server.ts. This shim loads the TypeScript daemon through jiti instead'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "The npm-install blockers are fixed. The detached fetcher now starts from src/daemon.mjs, plain JavaScript that loads fetcher.ts through jiti (moved to dependencies), so it runs from under node_modules. config.ts and spool.ts no longer import pi: agentDir() reproduces pi's rule (PI_CODING_AGENT_DIR with ~ expansion, else ~/.pi/agent). Inside pi, the extension sets PI_EMAIL_LISTENER_CONFIG and PI_EMAIL_LISTENER_MAIL_DIR from pi's own getAgentDir(), and the detached child inherits them. Proven in the installed shape: npm pack, npm install --legacy-peer-deps into a scratch folder with no pi peer present, then startService() from plain node stored a fixture message and stopped. scripts/fetch.ts is deleted, and npm run fetch uses the same entry."
    status: verified
    support: 0.9
    evidence: ["command: red — npm pack of HEAD, npm install --legacy-peer-deps, then the command service.ts spawned → 'Cannot find module …\\pel-red\\node_modules\\pi-email-listener\\scripts\\fetch.ts'", "command: green — npm pack of the fix, npm install --legacy-peer-deps, node drive.mjs → 'peer present? no · jiti installed? yes', 'started: true', 'service.log: [probe] stored … installed-shape probe → probe-example.com.eml', 'stopped · alive now: false · spooled: true'", "file: src/daemon.mjs — 'const { run } = await createJiti(import.meta.url).import(\"./fetcher.ts\"); await run();'", "file: src/extension.ts — 'process.env.PI_EMAIL_LISTENER_CONFIG ??= join(getAgentDir(), \"pi-email-listener.json\")'", "command: npm run test:all → seven suites 'all checks passed', 125 ok"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c3
    text: "Only src/extension.ts may import pi at runtime, and agentDir() must equal pi's getAgentDir(). scripts/self-check.ts asserts both. It checks parity with PI_CODING_AGENT_DIR unset, starting with ~, and as a plain path, and it scans src/ for any non-type import from @earendil-works/. Run against HEAD's config.ts and spool.ts, the scan flags them, so it would have caught the npm-install bug that every checkout-based check missed."
    status: verified
    support: 0.85
    evidence: ["command: npm run self-check → 'ok the agent directory matches pi's by default', 'ok and when PI_CODING_AGENT_DIR starts with ~', 'ok and when it is a plain path', 'ok nothing the fetcher loads imports pi at runtime'", "command: git show HEAD:src/<file> through the same regex → 'config.ts HEAD: imports pi at runtime (caught)', 'spool.ts HEAD: imports pi at runtime (caught)', 'extension.ts HEAD: clean'"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## Why nobody noticed

Every check runs from the checkout: `npm run service-check` really starts the service, but from a path
that is not under `node_modules` and next to a `node_modules` that has the pi packages as
devDependencies. The local `pi install C:/Coding/pi-email-listener` loads the same checkout. All three
blockers live only in the published shape, which nothing has exercised.

## The fix (c2), borrowed from pi-jev-wiki's embedder

- The detached process starts from a **plain `.mjs` launcher**, `src/daemon.mjs`, which loads the
  TypeScript with jiti. jiti moved from devDependencies to dependencies.
- The launcher sits under a **published path** (`src/`). `scripts/fetch.ts` is gone, and
  `npm run fetch` uses the same launcher.
- The static `import { getAgentDir }` had to leave the modules the child loads: it fails at module
  link time even when `PI_EMAIL_LISTENER_CONFIG` and `PI_EMAIL_LISTENER_MAIL_DIR` are set. Inside
  pi, the extension now sets those two from pi's own `getAgentDir()`, so the parent and the child
  agree with pi even on a branded build. Outside pi, `agentDir()` reproduces pi's rule.

## How it is proven

In the installed shape, not the checkout: `npm pack`, then `npm install --legacy-peer-deps` of the
tarball into a scratch folder, which leaves out the pi peer as pi does. Then, from plain node,
`startService()` from the installed copy. The red run (HEAD) could not find `scripts/fetch.ts`. The
green run stored a fixture message and stopped cleanly. The guard in [c3](#c3) is the offline stand-in
for that test, which needs the network and so stays out of `test:all`.

## See also

- [Two halves joined by a spool](../architecture/architecture-spool-and-wake.md) — the service this
  stops from starting
- home wiki: `procedures/decision-symlink-dev-tooling.md` — why dev checkouts hide install-shape bugs
