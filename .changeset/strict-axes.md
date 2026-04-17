---
"oxlint-plugin-effect": minor
---

**Breaking:** `strict` is now a namespace of composable axes, not a flat rule record.

Previously `strict` was one object with every rule at error. Consumers hit a wall: you wanted strict's Effect correctness checks, but turning it on also demanded a full control-flow rewrite (453 `noIfStatement` errors on one real codebase). So you either went nuclear or skipped strict entirely.

New shape:

```ts
export const strict = {
  core: {...},        // API bans + AST correctness + enforcing bans (~50 rules)
  controlFlow: {...}, // noIfStatement / noTernary / noSwitchStatement / noReturnInArrow
  style: {...},       // noArrowLadder / noStringSentinelConst / noUnnecessaryArrowBlock / noIifeWrapper
  all: {...},         // every axis merged — the old behaviour
}
```

**Migration:**

```ts
// before
rules: { ...strict }

// after — same semantics as before
rules: { ...strict.all }

// or — what you probably actually wanted
rules: { ...full, ...strict.core }
```

The axes let you adopt strict incrementally: enable `core` for correctness on day one, add `controlFlow` when you're ready to rewrite to `Match.value`, add `style` last.
