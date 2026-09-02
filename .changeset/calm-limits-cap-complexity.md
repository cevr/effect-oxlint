---
"oxlint-plugin-effect": minor
---

Cap function complexity in the recommended preset. The preset now enables the native oxlint `complexity` rule (cyclomatic, max 21) and two new plugin rules: `effect/maxCognitiveComplexity` (SonarSource cognitive complexity, max 21) and `effect/maxHalsteadDifficulty` (Halstead difficulty, max 79). Both rules accept `{ max }`. Rule metadata can declare `recommendedOptions`, which the generated preset publishes as `["error", options]`.
