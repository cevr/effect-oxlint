---
"oxlint-plugin-effect": patch
---

`strict` preset: drop broken rule ref, v3-only rules, and `noAsyncFunction`. Same cleanup as `full`.

- **Removed `noReturnNull`** — that rule name doesn't exist in the plugin (only `noReturnNullish`, which is already in strict). Previously caused oxlint to fail to parse the config when consumers used `strict`.
- **Removed `noAsyncFunction`** — belongs in `effect-native`, not a version-agnostic strict baseline.
- **Removed `noCatchAllToMapError`, `noEffectGenAdapter`, `noRuntimeRunFork`** — v3-only. Layer the `v3` preset on top when linting v3 code.

Matches the cleanup applied to `full` in the previous release. `strict` is now a "full + style/functional + everything at error" preset with no version assumptions.
