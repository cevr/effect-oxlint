import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/plugin.ts",
    "src/presets/index.ts",
    "src/presets/recommended.ts",
    "src/vendor/effect-oxlint/index.ts",
  ],
  format: "esm",
  dts: true,
  clean: true,
  unbundle: true,
  platform: "neutral",
  target: "esnext",
  deps: {
    neverBundle: [/^@effect\//, /^effect/, /^@oxlint\//],
  },
});
