---
"oxlint-plugin-effect": minor
---

`requireForceKillAfter` reads a parameter that holds an array as the command's arguments, not its options: `make(cmd, args)` with `args` a rest parameter, or a parameter typed `T[]`, `readonly T[]`, `Array<T>` or `ReadonlyArray<T>`, names no `forceKillAfter` and is reported, as `make(cmd, ["arg"])` is. An untyped parameter may hold the options and is still left alone.
