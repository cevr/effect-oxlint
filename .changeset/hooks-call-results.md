---
"oxlint-plugin-effect": patch
---

`effect/noTestLifecycleHooks` no longer takes what a call returns as the file's own. 0.32.2 treated a local function's or class's result as local, so `const { afterAll } = (() => require("vitest"))()` went unreported where 0.32.1 reported it. Now:

- A call's result is followed only into a function the file defines and never rebinds (an IIFE, a local arrow or function declaration, an async thunk): what its `return`s give, together with its arguments. A project module's export keeps its project provenance. Any other call's or `new`'s result is unknown, and a name spelled like a hook bound from it stays reported.
- A parameter's default value, a class's static fields, its base class and its decorators are followed. A getter, a static block and a generator are unknown.
- A binding that may be changed after it is made (passed to a call such as `Object.assign(o, …)`, a member assigned, a method called on it, or an alias of it changed) is unknown.
