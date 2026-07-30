---
"oxlint-plugin-effect": patch
---

Allow `process.stdout.isTTY`, `process.stderr.isTTY`, and `process.stdin.isTTY` reads in `effect/noGlobals`. No Effect service exposes TTY detection; every other use of the process streams stays banned.
