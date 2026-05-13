---
"oxlint-plugin-effect": patch
---

Simplify the project to a single oxlint plugin package, remove the tsgolint fork/workspace, expose rule authoring bindings, and add generic Effect lint rules for unsafe constructors, hand-rolled tagged unions, dynamic imports, promise-style test control flow, fixed sleeps in tests, spread syntax, and Schema.Struct usage.
