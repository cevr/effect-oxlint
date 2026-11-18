// Lints this repo with its own built plugin (`bun run build` first).
// Every recommended rule is on.
import { recommended } from "./dist/presets/recommended.js";

export default {
  jsPlugins: ["./dist/plugin.js"],
  ignorePatterns: [
    "**/dist/**",
    "**/node_modules/**",
    "**/*.d.ts",
    "src/vendor/**",
    "tests/integration/**",
    "tests/probes/**",
  ],
  rules: {
    ...recommended,
    // This repo predates effect/noComments and documents each rule's contract
    // in comments; like most existing codebases, it opts out.
    "effect/noComments": "off",
  },
  overrides: [
    {
      // Build scripts and the test harness are host adapters, not Effect programs:
      // they read argv, spawn oxlint, set exit codes, and find their files from
      // the module path. noGlobals exempts platform adapters explicitly.
      files: ["scripts/**", "tests/support/**"],
      rules: {
        "effect/noNodeBuiltinImport": "off",
        "effect/noGlobals": "off",
        "effect/noModulePathFacts": "off",
      },
    },
    {
      // tn1Lint runs the @cvr/tn1-lint binary: a host adapter that spawns a
      // process, and resolves and loads the package the lint root installed
      // (its lintSync), which no static import can name.
      files: ["src/rules/tn1-lint.ts"],
      rules: {
        "effect/noNodeBuiltinImport": "off",
        "effect/noDynamicImports": "off",
      },
    },
    {
      // The rules walk oxlint's ESTree, whose `node.type` union is the host's:
      // this repo cannot remodel it as a tagged enum with one exhaustive match,
      // which is repeatedSwitches' remedy.
      files: ["src/rules/**"],
      rules: {
        "effect/repeatedSwitches": "off",
      },
    },
    {
      // Two effect releases' modules are not one type, so the test harness
      // that compares them reads 4.0.0's under the installed release's types,
      // in this one file.
      files: ["tests/support/effect-releases.ts"],
      rules: {
        "effect/noAs": "off",
        "effect/noChainedTypeAssertions": "off",
      },
    },
  ],
};
