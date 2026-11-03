---
"oxlint-plugin-effect": minor
---

Add `effect/noComments` to the recommended preset. It reports every comment except tool directives: oxlint and ESLint suppressions, `@ts-*`, `@effect-diagnostics`, triple-slash references, bundler annotations such as `#__PURE__`, JSX pragmas, and formatter and coverage ignores. A codebase that documents itself in comments can turn it off with `"effect/noComments": "off"` after spreading the preset.
