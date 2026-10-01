---
"oxlint-plugin-effect": minor
---

New recommended rule `requireForceKillAfter`: every `ChildProcess.make` command names `forceKillAfter`. When a child's scope closes, the platform spawner sends SIGTERM, waits one second, and then waits for exit with no bound unless `forceKillAfter` is set, so a child that ignores SIGTERM holds its scope open forever. The rule reads `make` from `effect/process` (`ChildProcess.make`, `P.ChildProcess.make`) and `effect/process/ChildProcess` (a namespace or the named `make` under any alias). It reports a command with no options, an options object literal (inline, held in a `const`, or spread from one) without `forceKillAfter`, and the bare template form ``make`cmd` ``, which cannot carry options; write ``make({ forceKillAfter: "5 seconds" })`cmd` ``. Options it cannot see, such as a parameter, stay allowed.
