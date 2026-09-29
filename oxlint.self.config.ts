// Lints this repo with its own built plugin (`bun run build` first).
// Every recommended rule is on except the baseline below: rules that still
// report on this codebase. Fix a rule's findings, then delete its line.
import { recommended } from "./dist/presets/recommended.js";

const baseline = [
  "complexity",
  "effect/maxCognitiveComplexity",
  "effect/noAs",
  "effect/noAsyncFunction",
  "effect/noChainedTypeAssertions",
  "effect/noGlobals",
  "effect/noNodeBuiltinImport",
  "effect/noNullish",
  "effect/noRuntimeTypeof",
  "effect/noShapeInSymbolNames",
  "effect/noTernary",
  "effect/noUnknownParameters",
  "effect/noUnsafeDictionaryType",
] as const;

export default {
  jsPlugins: ["./dist/plugin.js"],
  ignorePatterns: [
    "**/dist/**",
    "**/node_modules/**",
    "**/*.d.ts",
    "src/vendor/**",
    "tests/integration/**",
  ],
  rules: {
    ...recommended,
    ...Object.fromEntries(baseline.map((rule) => [rule, "off"])),
  },
};
