---
"oxlint-plugin-effect": patch
---

`preferPredicateIsTagged` and `preferMatchTagsExhaustive` now report only in files that import `effect`, an `effect/` subpath, or an `@effect/` package. Their fixes need `Predicate` or `Match`, so a plain TypeScript file with `_tag` unions is no longer reported.
