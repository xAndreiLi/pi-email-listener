# decisions

| Page | Type | Tags | Summary | Updated |
|------|------|------|---------|---------|
| [No gate, a pointer not a digest, and watching only when asked](../decisions/decision-no-gate-and-pointer.md) | decision | decision gate wake-payload opt-in quarantine email | pi-email-listener turns the agent for every message — no relevance gate, no batching, no suppression rules — and the wake carries the sender, the subject and a file path rather than the body. Watching is opt-in per session through /email-watch. A message with a link or attachment turns the agent with bash, edit and write blocked until the turn ends. | 2026-10-09 |
