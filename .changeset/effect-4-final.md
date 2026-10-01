---
"oxlint-plugin-effect": minor
---

Requires Effect 4.0.0. The peer range is now `>=4.0.0 <5`. `noUnboundedRetry` recognizes HttpClient imported from `effect/http/HttpClient`, and `noNodeBuiltinImport` points at `effect/process`, `effect/http` and `effect/workers`, the Effect 4.0.0 homes of the former `effect/unstable/*` modules.
