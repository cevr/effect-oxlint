---
"oxlint-plugin-effect": minor
"tsgolint-effect": minor
---

Support v3/v4 dual-version codebases and add rule-version metadata.

**`tsgolint-effect` (Go type-aware linter):**

- `IsEffectPackageSymbol` now matches paths across all mainstream package managers (npm/yarn-classic `node_modules/effect`, pnpm `.pnpm/effect@`, bun isolated `.bun/effect@`, yarn berry `.yarn/cache/effect-npm-`) and the `effect-v3` alias used by dual-version projects. Previously, v3 code imported as `effect-v3` silently bypassed every type-aware rule.
- `IsEffectType`, `IsLayerType`, `IsStreamType`, `IsScopeType` now check the `~effect/*` brand property on types first, falling back to the symbol-name + path heuristic. More robust across package managers and future-proof against package-name changes.
- Added `Rule.EffectVersion` field (`"v3" | "v4" | "both"`, default `"both"`) for version-specific rules.

**`oxlint-plugin-effect` (JS AST linter):**

- Added `meta.docs.effectVersion` on rules (`"v3" | "v4" | "both"`, default `"both"`). Preset authors can filter rules per project version.
- Tagged the following rules as `"v3"` (they detect v3-only APIs): `noCatchAllToMapError`, `noEffectGenAdapter`, `noRuntimeRunFork`.
- **Renamed `noRunInEffect` → `noRunInEffectGen`.** The old rule fired globally (outside Effect context too — a bug). The new rule is context-aware via `makeEffectContextTracker` and only fires inside `Effect.gen`/`Effect.fn`. Expanded coverage to `Runtime.run{Sync,Promise,Fork,Callback}`. Explicitly permits `Effect.run*With` (v4 explicit-services variants) and `<identifier>.run*` (ManagedRuntime-shaped calls) — both are legitimate at callback boundaries. Preset users must update `"effect/noRunInEffect"` references to `"effect/noRunInEffectGen"`.
