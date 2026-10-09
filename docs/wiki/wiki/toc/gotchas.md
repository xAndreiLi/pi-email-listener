# gotchas

| Page | Type | Tags | Summary | Updated |
|------|------|------|---------|---------|
| [A mail turn meets wiki capture](../gotchas/gotcha-mail-turn-meets-capture.md) | gotcha | gotcha wiki capture email privacy unattended | A message delivered by a wake is read by the agent, so its text is in the transcript — and wiki capture snapshots the transcript. A session watching mail therefore feeds third-party mail into whichever wiki captures that session, including this one, unless capture is off for it. The extension says so when watching starts. | 2026-10-09 |
| [The node_modules junction blocks npm install, and with it CI](../gotchas/gotcha-junction-blocks-npm-install.md) | gotcha | gotcha node_modules junction npm ci windows tooling | This repo's node_modules is a Windows junction to the pi install's node_modules, which is what lets a jiti script import pi's packages with no install step. Anything that writes into node_modules — npm install — would write into the shared pi install instead, so the dev loop never installs, and CI cannot use npm ci until the repo has a real install and a lockfile. | 2026-10-09 |
