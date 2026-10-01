---
"oxlint-plugin-effect": minor
---

Test rules close five gaps, and `noWithWrapperCall` can narrow its test exemption.

- `effect/noEffectRunInTests` reports a runner method on any runtime value in test code (`runtime.runPromise(...)`, `ui.clientRuntime.runPromiseExit(...)`, `program.pipe(runtime.runPromise)`, `runtime.runSync(...)`), called or passed as a reference. A boundary file keeps its override.
- `effect/noWithWrapperCall` takes `testFiles`: globs that replace the test definition for its callback-helper exemption alone. With `{ "testFiles": ["**/tests/**"] }`, only files under a `tests/` tree keep `withX(callback)` helpers; shared harness code that `effect.testFiles` counts as test code is held to the rule. Without the option the exemption is unchanged.
- `effect/noFixedWaitInTests` reports each sleep inside a waited expression: piped, raced, sequenced, or bound to a result (`yield* settled.pipe(Effect.raceFirst(Effect.sleep(...)))`, `await Promise.race([Bun.sleep(10), ...])`). A sleep inside a nested function, such as a mock's `read: () => Effect.sleep(...)`, stays allowed.
- `effect/noFixedWaitInTests` reports a sleep stored under a name, in a variable's initializer or an object field (`const pause = Effect.sleep(...)`, `{ settle: Effect.sleep(...) }`), since a later `yield* pause` waits on it. A stored forked sleep is reported too. A real-clock fence the subject needs takes a reasoned line suppression.
- `effect/noTimeoutDieInTests` reads a die's message inside object and array payloads, so `Effect.die(new WaitForError({ message: "timed out ..." }))` and `Effect.die({ reason: "gave up ..." })` are reported.
