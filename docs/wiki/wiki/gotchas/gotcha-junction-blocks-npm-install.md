---
title: "The node_modules junction blocks npm install, and with it CI"
type: gotcha
topic: gotchas
summary: "This repo's node_modules is a Windows junction to the pi install's node_modules, which is what lets a jiti script import pi's packages with no install step. Anything that writes into node_modules — npm install — would write into the shared pi install instead, so the dev loop never installs, and CI cannot use npm ci until the repo has a real install and a lockfile."
tags: [gotcha, node_modules, junction, npm, ci, windows, tooling]
updated: 2026-10-09
sources: [home: raw/sessions/2026-10-09-session-2026-10-09-061532.md]
files: [C:/Coding/pi-email-listener/README.md, C:/Coding/pi-email-listener/package.json]
claims:
  - id: c1
    text: "`node_modules` in this repository is a junction to the pi install's own node_modules (`mklink /J node_modules C:\\Users\\liand\\.pi\\agent\\install\\releases\\1.1.0\\node_modules`), so imports of `@earendil-works/pi-coding-agent` resolve without any install step. The dev loop therefore never runs `npm install`: npm would write into the pi install the junction points at, not into the working tree. The junction is gitignored and must not be packed."
    status: unverified
    support: 0.7
    evidence: ["command: cmd //c \"mklink /J node_modules C:\\Users\\liand\\.pi\\agent\\install\\releases\\1.1.0\\node_modules\" → 'Junction created for node_modules', 2026-10-09", "command: node -e \"import('@earendil-works/pi-coding-agent').then(m=>console.log(m.getAgentDir()))\" → C:\\Users\\liand\\.pi\\agent in 1.4 s, the pi package resolving through the junction", "file: .gitignore — node_modules/ is ignored with the note that it is a junction to the pi install", "reasoning, not observation: npm writing into the junction's target follows from the junction being transparent to path resolution; the confirming test is `npm install` in a throwaway copy of this repo"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
  - id: c2
    text: "The consequence for CI: a workflow cannot run `npm ci`, because there is no lockfile and no real install in this repository — installing one is a deliberate step that replaces the junction. Until then the checks run locally through the junction (`npm run test:all`), and any CI added before that step would fail at the install."
    status: verified
    support: 0.8
    evidence: ["command: git ls-files | grep lock → no package-lock.json is tracked in C:/Coding/pi-email-listener", "file: package.json — scripts test:all/self-check/load-check run through jiti, which resolves from the junction with no install"]
    reviewed: 2026-10-09
    last_checked: 2026-10-09
---

## Why this shape at all

The same dev loop as the sibling package `pi-job-listener`, and it is the reason extensions can be
tested without publishing: pi supplies its own packages to extensions, so a package that only
*consumes* them does not need its own copy. The cost is that this repository cannot be installed
from, and that a fresh clone needs the junction recreated before anything runs.

## Reproducing it

```bash
cmd //c "mklink /J node_modules C:\Users\liand\.pi\agent\install\releases\1.1.0\node_modules"
npm run test:all
```

When publishing does need a real dependency tree — for the packed-tarball test, the layer that
catches `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` — do it in a throwaway copy rather than in the
working tree, so the junction survives.
