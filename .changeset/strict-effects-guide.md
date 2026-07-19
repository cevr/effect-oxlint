---
"oxlint-plugin-effect": major
---

Replace the legacy preset matrix with one strict `recommended` preset for Effect-native application code. The maintained AST-only rules now ban imperative failure handling, Promise control flow, ternaries, inline dynamic imports, and runtime capabilities that have direct Effect replacements while preserving explicit defect, lazy-loading, and platform-adapter boundaries.
