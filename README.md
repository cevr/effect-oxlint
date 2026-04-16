# effect-oxlint

oxlint plugin + type-aware linter for [Effect](https://effect.website) codebases.

## Packages

| Package | What | Install |
|---------|------|---------|
| [`oxlint-plugin-effect`](./packages/oxlint-plugin-effect) | 59 AST lint rules | `bun add -D oxlint-plugin-effect` |
| [`tsgolint-effect`](./packages/tsgolint-effect) | 24 type-aware lint rules | `bun add -D tsgolint-effect` |

## Quick Start

```bash
bun add -D oxlint oxlint-plugin-effect
```

`.oxlintrc.json`:
```json
{
  "jsPlugins": ["oxlint-plugin-effect/plugin"],
  "rules": {
    "effect/noEffectDo": "error",
    "effect/noNestedPipe": "error",
    "effect/noThrowStatement": "error",
    "effect/noGlobals": "warn"
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.test.tsx", "**/tests/**", "**/test/**"],
      "rules": {
        "effect/noInlineProvide": "off"
      }
    }
  ]
}
```

The `overrides` entry turns off `noInlineProvide` in test files. The rule's intent is "provide layers at the boundary, not scattered through production code" — in tests, `it.effect(() => Effect.gen(function*() { ... }).pipe(Effect.provide(TestLayer)))` *is* the boundary.

Other rules (`noThrowStatement`, `noTryCatch`, `noNewError`, etc.) stay enabled in tests — test code should still prefer Effect primitives.

```bash
oxlint
```

### Type-Aware Rules

For rules that need the TypeScript type checker (floating effects, missing `yield*`, etc.):

```bash
bun add -D tsgolint-effect
```

```json
{
  "jsPlugins": ["oxlint-plugin-effect/plugin"],
  "options": { "typeAware": true },
  "rules": {
    "effect/floating-effect": "error",
    "effect/missing-yield-star": "error",
    "effect/return-effect-in-gen": "error",
    "effect/catch-unfailable": "warn"
  }
}
```

```bash
OXLINT_TSGOLINT_PATH=./node_modules/.bin/tsgolint-effect oxlint
```

## Rules

### JS Plugin (AST-only, fast)

59 rules across categories: API bans, global bans, import bans, statement bans, AST patterns, and Effect-context rules. Five presets available: `core`, `full`, `effect-native`, `functional`, `strict`.

### Go Binary (type-aware)

| Rule | Description |
|------|-------------|
| `effect/floating-effect` | Effect created but never yielded or run |
| `effect/missing-yield-star` | `yield` without `*` on Effect in Effect.gen |
| `effect/return-effect-in-gen` | `return Effect` instead of `return yield* Effect` |
| `effect/catch-unfailable` | `.catch*` on an infallible Effect (`never` error) |
| `effect/schema-sync-in-effect` | `Schema.decodeSync` inside Effect.gen |
| `effect/lazy-promise-in-sync` | `Effect.sync(() => promise)` |
| `effect/effect-in-failure` | Effect type in the error channel |
| `effect/effect-in-void-success` | Nested `Effect<Effect<...>>` |

## Development

```bash
bun install
bun run gate        # runs JS + Go gates in parallel
bun run gate:js     # typecheck + test JS plugin
bun run gate:go     # build + test Go binary
bun run codegen     # regenerate rules index
bun run add-rule <name> [--context]  # scaffold new JS rule
```

## License

MIT
