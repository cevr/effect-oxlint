---
"oxlint-plugin-effect": patch
---

Four rule fixes:

- `effect/noTestLifecycleHooks` resolves the hook's binding: a hook imported from a package (`bun:test`, `vitest`, `node:test`, `mocha`, ...) is reported under another name (`import { afterAll as cleanup } from "bun:test"`) or through a namespace import (`bt.afterEach(...)`), as is an unbound global hook. A local function, or an import from the project's own modules (relative, absolute, `@/`, `~` or `#` paths), named like a hook is left alone. (#72)
- `effect/noReduceAccumulatorCopy` reports a spread of the accumulator into a fresh array or object (`[...acc, x]`, `{ ...acc, [k]: v }`), so the recommended preset catches the quadratic copy without `oxc/no-accumulating-spread`. (#73)
- The Effect-namespace rules (`noFixedWaitInTests`, `noSilentCatchAll` and the rest) take an imported `Effect` (or `Stream`, `Layer`, ...) for effect's module only when it is imported from `effect`, an `effect/*` subpath or an `@effect/*` package; a project module's own `Effect` export is no longer misread. (#74)
- `effect/noSilentCatchAll` reports Effect 4's `Effect.catch` and `Effect.catchCause` beside `catchAll` and `catchAllCause`. (#75)
