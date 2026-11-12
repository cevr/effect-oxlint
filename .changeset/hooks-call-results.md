---
"oxlint-plugin-effect": patch
---

`effect/noTestLifecycleHooks` no longer tries to prove where a value comes from. 0.32.2 traced a hook-named binding's value through the file and left it alone when the value looked local, and every form it did not model read as local: a call's result (`const { afterAll } = (() => require("vitest"))()`), a tagged template, `await` on a thenable, an iterator, a callback parameter, a destructuring default (`const { afterAll = require("vitest").afterAll } = {}`). 0.32.1 reported each of these.

Now a call of `beforeEach`, `afterEach`, `beforeAll`, `afterAll`, `before` or `after` (and `test.`, `it.` or `describe.<hook>`) is reported unless the callee is a plain name whose one binding is exactly one of:

- a function declaration in the file, never reassigned;
- `const <name> = () => …` or `const <name> = function …`, the function literal itself;
- a default or named value import from a project path (`.`, `/`, `@/`, `~`, `#`).

Every other binding is reported: a parameter, a `catch` binding, any destructuring (defaults included), `let` and `var`, a call's result, `require`, a member, a namespace's member, a type import, a global.

The issue #72 forms stay reported: a package's hook imported under another name (`import { afterAll as cleanup } from "bun:test"`) and `<namespace>.<hook>` on a package's namespace or default import.
