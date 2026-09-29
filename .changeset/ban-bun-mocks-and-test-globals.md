---
"oxlint-plugin-effect": minor
---

Extend `effect/noModuleMocks` to bun:test and to every mock-double entry point. It now reports `mock.module()`, bare `mock()`, and bare `spyOn()` bound to `bun:test`, plus `fn`, `doMock`, `mocked`, and `unmock` on `vi` and `jest` from `vitest`, `@jest/globals`, `bun:test`, or the unshadowed runner globals. `vi.fn()` and `jest.fn()` were previously allowed and are now reported.

Add `effect/noTestGlobals` to the recommended preset. It reports writes (assignment, update, and `delete`) to `globalThis`, `window`, `global`, `self`, and `process.env`; `Reflect.set`/`defineProperty`/`deleteProperty` and `Object.assign`/`defineProperty`/`defineProperties` on those objects; `vi.stubGlobal`, `vi.stubEnv`, `vi.unstubAllGlobals`, `vi.unstubAllEnvs`, and `jest.replaceProperty`; and any runner global such as `describe`, `it`, `expect`, or `beforeEach` that no import provides.
