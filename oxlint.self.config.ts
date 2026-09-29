// Lints this repo with its own built plugin (`bun run build` first).
// Every recommended rule is on except the baseline below: rules that still
// report on this codebase. Fix a rule's findings, then delete its line.
import { recommended } from "./dist/presets/recommended.js";

const baseline = ["effect/noNullish", "effect/noTernary"] as const;

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
  overrides: [
    {
      // Build scripts and the test harness are host adapters, not Effect programs:
      // they read argv, spawn oxlint, and set exit codes. noGlobals exempts
      // platform adapters explicitly.
      files: ["scripts/**", "tests/support/**"],
      rules: { "effect/noNodeBuiltinImport": "off", "effect/noGlobals": "off" },
    },
  ],
};
