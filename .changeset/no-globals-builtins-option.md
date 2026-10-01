---
"oxlint-plugin-effect": minor
---

`noGlobals` takes a `builtins` option. `builtins: false` drops the built-in list of banned globals and keeps only the `members` bans, so a plain script that may use `console`, `process.env` and `Bun` directly can still ban specific members: `{ "builtins": false, "members": { "Bun": { "properties": ["Glob"], "use": "Effect FileSystem" } } }` reports `Bun.Glob` in every spelling the rule follows (`globalThis["Bun"].Glob`, an alias) and nothing else. The default, `true`, keeps today's behavior.
