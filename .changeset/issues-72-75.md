---
"oxlint-plugin-effect": patch
---

Four rule fixes:

- `effect/noTestLifecycleHooks` resolves the hook's binding through imports and CommonJS `require` (including one made with `createRequire`). A hook from a package (`bun:test`, `vitest`, `node:test`, `mocha`, ...) is reported:
  - under another name: `import { afterAll as cleanup } from "bun:test"`, `const { afterEach: done } = require("node:test")`;
  - through a namespace, default import or required module: `bt.afterEach(...)`, `require("mocha").beforeEach(...)`;
  - on a runner's test API: `test.beforeEach(...)` from `vitest`.

  An unbound global hook is reported, as before. A local function, or an import or `require` of the project's own modules (relative, absolute, `@/`, `~` or `#` paths), named like a hook is left alone. (#72)
- `effect/noReduceAccumulatorCopy` reports a spread of the accumulator into a fresh array or object (`[...acc, x]`, `{ ...acc, [k]: v }`), so the recommended preset catches the quadratic copy without `oxc/no-accumulating-spread`. (#73)
- The Effect-namespace rules (`noFixedWaitInTests`, `noSilentCatchAll` and the rest) take an imported `Effect` (or `Stream`, `Layer`, ...) for effect's module only when it is imported from `effect`, an `effect/*` subpath or an `@effect/*` package; a project module's own `Effect` export is no longer misread. (#74)
- `effect/noSilentCatchAll` reports Effect 4's `Effect.catch` and `Effect.catchCause` beside `catchAll` and `catchAllCause`. (#75)
