---
"oxlint-plugin-effect": patch
---

`presets/recommended.json` declares `"plugins": []`. Without it, oxlint 1.86 gave a config that extends the preset oxlint's default plugins (unicorn, oxc, ...) on top of its own `plugins`, so rules such as `unicorn/consistent-function-scoping` and `unicorn/no-array-sort` fired in projects that never enabled unicorn. The extending config's `plugins` list now decides the built-in plugins.
