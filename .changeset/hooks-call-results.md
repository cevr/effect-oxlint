---
"oxlint-plugin-effect": patch
---

`effect/noTestLifecycleHooks` no longer takes code's result as the file's own unless it can follow that code. 0.32.2 treated a local function's or class's result as local, so `const { afterAll } = (() => require("vitest"))()` went unreported where 0.32.1 reported it. Now:

- **Explicit calls.** A call's result is followed only into a function the file defines and never rebinds (an IIFE, a local arrow or function declaration, an async thunk): what its `return`s give, together with its arguments. A project module's export keeps its project provenance. Any other call's or `new`'s result is unknown, and a name spelled like a hook bound from it stays reported.
- **Calls the language makes.** These go by the same rule:
  - a tagged template calls its tag;
  - `await` resolves a thenable;
  - array destructuring, `for…of` and spread run an iterator;
  - getters and setters run on reads and writes;
  - decorators run on class definitions;
  - `toString`/`valueOf` coercions can mutate other bindings.

  A local object or class with a `then` or computed key is unknown when it is awaited, iterated or spread. A getter, a decorator, a static block and a generator are unknown. A `Proxy` is a `new`.
- **Parameters.** A parameter is followed into its callers: only a function the file defines and calls directly (never passed, returned, put in a value or exported) has known callers, and its parameters take what those calls pass. A callback's or a method's parameter is unknown, and so is a `catch` binding. So `import("vitest").then(({ afterAll }) => afterAll())` is reported, as in 0.32.1.
- **Defaults and classes.** Parameter defaults, class static fields and base classes are followed.
- **Mutation.** A binding that may be changed after it is made (passed to a call such as `Object.assign(o, …)`, a member assigned, a method called on it, or an alias of it changed) is unknown.
