---
"oxlint-plugin-effect": minor
---

`noGlobals` follows a global's value instead of matching one syntax shape. It reports a banned global read through the global object (`globalThis.fetch()`, `new globalThis.Date()`, `self.setTimeout()`, `globalThis.process.env`), through a computed string member (`process["env"]`, ``console[`log`]``), through `as`/`!`/`satisfies`/`?.`, and through an alias or destructure (`const { env } = process`, `const p = process; p.env`, `const D = Date; new D()`, `const { process: p } = globalThis`, `const { process: { env } } = globalThis`). An alias is followed only while every write to it stores the same global, so `let p = process; p = local; p.env` does not report, and an alias cycle ends. A global the `members` option bans whole (`{ "Bun": { "use": "..." } }`) is reported wherever its value leaves the rule's sight, such as `use(Bun)` or `const { ...rest } = Bun`. Code that passed only because of the spelling now reports.
