---
"oxlint-plugin-effect": minor
---

`requireForceKillAfter` names the signal the spawner sends on interrupt or timeout: SIGTERM when the command names no `killSignal`, else the command's `killSignal` as written, or "the command's killSignal" when the rule cannot read it. A command whose `killSignal` is `"SIGKILL"` (or `9`) cannot be ignored and is not reported.
