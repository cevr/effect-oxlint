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
  ],
  rules: recommended,
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
  ],
};
