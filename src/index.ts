/**
 * effect-oxlint-plugin
 *
 * oxlint plugin providing Effect-specific lint rules.
 * Ports rules from biome-effect-linting-rules and effect-ts/language-service.
 */
export { default as plugin } from "./plugin.js";
export * as rules from "./rules/index.js";
export * as presets from "./presets/index.js";
export * as ruleBindings from "./vendor/effect-oxlint/index.js";
export * from "./vendor/effect-oxlint/index.js";
