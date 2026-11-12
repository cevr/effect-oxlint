---
"oxlint-plugin-effect": patch
---

Four rule fixes:

- `effect/noTestLifecycleHooks` resolves the hook's binding. A call of a name spelled like a hook (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`, and now node:test's and mocha's `before` and `after`) is still reported, as before, unless the name is proven to be the file's own (a parameter, a function, or a variable whose every value is made in the file) or to come from the project's own modules (an import, `require` or `import()` of a relative, absolute, `@/`, `~` or `#` path). A binding the rule cannot trace (a global, `globalThis`, an ambient `declare`) stays reported. In addition, a package's hook is reported (#72):
  - under another name: `import { afterAll as cleanup } from "bun:test"`, `const { afterEach: done } = require("node:test")`;
  - through a namespace, default import or required module: `bt.afterEach(...)`, `require("mocha").beforeEach(...)`, `(await import("vitest")).afterAll(...)`, `import v = require("vitest")`;
  - on a runner's test API: `test.beforeEach(...)`, `describe.afterAll(...)`, unless `test` is the project's own;
  - through TypeScript wrappers (`as`, `satisfies`, `!`, `<T>`), parentheses and reassignment.
- `effect/noReduceAccumulatorCopy` reports a spread of the accumulator into a fresh array or object (`[...acc, x]`, `{ ...acc, [k]: v }`), so the recommended preset catches the quadratic copy without `oxc/no-accumulating-spread`. (#73)
- The Effect-namespace rules (`noFixedWaitInTests`, `noSilentCatchAll` and the rest) take an imported `Effect` (or `Stream`, `Layer`, ...) for effect's module only when it is imported from `effect`, an `effect/*` subpath or an `@effect/*` package; a project module's own `Effect` export is no longer misread. (#74)
- `effect/noSilentCatchAll` reports Effect 4's `Effect.catch` and `Effect.catchCause` beside `catchAll` and `catchAllCause`. (#75)
