---
"oxlint-plugin-effect": patch
---

Recognize literal string and static template member keys in noNodeBuiltinImport. Imported process and crypto capabilities and configured module members now receive the same diagnostics as dot access, while dynamic keys and unmatched members remain allowed.
