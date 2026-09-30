---
"oxlint-plugin-effect": minor
---

Stricter tagged unions, a strict dynamic-import mode, project bans for runtime adapters, and an opt-in platform layer rule.

- `effect/preferSchemaTaggedUnion` reports `_tag` unions of any tag case. Lowercase and kebab-case tags (`{ _tag: "tool-call" } | { _tag: "text-delta" }`) were exempt; declare them with `Schema.TaggedStruct` variants joined by `Schema.toTaggedUnion`. A single tagged object, alone or beside `undefined`, is still not reported.
- `effect/noDynamicImports` takes `allowNamedBoundaries: false`, which reports every `import()`, named or not; a deliberate load keeps a reasoned line suppression. The default is unchanged.
- `effect/noGlobals` takes `members` (more members of a global to ban, all of them or the listed `properties`), and `effect/noNodeBuiltinImport` takes `modules` (more modules to ban, such as `bun`, `bun:*` or `os`, whole or only for listed `members`). Adapter files keep an override. The built-in bans are unchanged.
- Opt-in `effect/noPlatformLayerOutsideEntry`: a `layer*` export of a platform package (`@effect/platform-bun`, `-node`, `-node-shared`, `-browser`, or the `packages` option) is provided only in the entry files an override exempts. It follows imports, `import()`, aliases and destructures, and reports a platform module handed on and a re-export of a platform package. `layers` names a project's own platform layers.
