---
"oxlint-plugin-effect": minor
---

`noNewPromise` follows the global `Promise` as `noGlobals` follows the globals it bans, through one shared walk. It reports `new globalThis.Promise()`, `new globalThis["Promise"]()`, `new self.Promise()`, `globalThis.Promise.all([])`, `Promise["resolve"](1)`, `new (Promise as PromiseConstructor)()`, an alias (`const P = Promise; new P()`) and a destructure (`const { resolve } = Promise; resolve(1)`, `const { Promise: { all } } = globalThis`). A local binding named `Promise` is no longer reported, and an alias that is reassigned to another value is not followed. Code that passed only because of the spelling now reports.
