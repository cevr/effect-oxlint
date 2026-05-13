# oxlint-plugin-effect

Oxlint plugin for [Effect](https://effect.website) codebases.

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

The `overrides` entry turns off `noInlineProvide` in test files. The rule's intent is "provide layers at the boundary, not scattered through production code" — in tests, `it.effect(() => Effect.gen(function*() { ... }).pipe(Effect.provide(TestLayer)))` is the boundary.

```bash
oxlint
```

## Rule Authoring

The package also exports the Effect-first rule authoring bindings:

```ts
import { Diagnostic, Rule, RuleContext } from "oxlint-plugin-effect/rule-bindings";

export const noThing = Rule.define({
  name: "no-thing",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid thing.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      Identifier: (node) => ctx.report(Diagnostic.make({ node, message: "Avoid thing." })),
    };
  },
});
```

The same bindings are available from the root export for convenience:

```ts
import { Rule, Diagnostic, RuleContext } from "oxlint-plugin-effect";
```

## Rules

66 AST-only rules across categories: API bans, global bans, import bans, statement bans, AST patterns, and Effect-context rules. Five presets are available: `core`, `full`, `effect-native`, `functional`, and `strict`.

## Development

```bash
bun install
bun run gate
bun run codegen
bun run add-rule <name> [--context]
```

## License

MIT
