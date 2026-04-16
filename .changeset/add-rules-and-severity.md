---
"oxlint-plugin-effect": minor
"tsgolint-effect": minor
---

Add 10 new JS AST rules, 16 new Go type-aware rules, and promote high-frequency agent violations to error severity.

**JS plugin (76 rules):**
- New rules: noCatchAllToMapError, noUnnecessaryPipeChain, noMultipleEffectProvide, noSchemaUnionOfLiterals, noSchemaStructWithTag, noRedundantSchemaTagIdentifier, noEffectMapFlatten, noGlobalErrorInEffectFailure, noGlobalErrorInEffectCatch, noPositionalLogError
- Extended noGlobalRandom/noRandomInEffect with crypto.randomUUID, Bun.randomUUID
- Redesigned Rule.banMultiple API with per-spec BanSpec discriminated union
- Promoted high-frequency rules from warn to error in core/full presets

**Go binary (24 rules):**
- Layer/leak detection: missingEffectContext, missingEffectError, missingLayerContext, leakingRequirements, layerMergeAllWithDependencies
- Error hygiene: anyUnknownInError, unknownInEffectCatch
- Code quality: effectFnOpportunity, classSelfMismatch, fnImplicitAny, scopeInLayerEffect, strictProvide, unnecessaryFailYieldable, genericServices, overriddenSchemaConstructor, nonObjectServiceType
