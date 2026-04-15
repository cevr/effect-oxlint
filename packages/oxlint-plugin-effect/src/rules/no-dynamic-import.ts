/**
 * Ban dynamic `import()` expressions.
 *
 * Use static module imports.
 *
 * Source: biome-effect-linting-rules/prevent-dynamic-imports
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noDynamicImport = Rule.banStatement("ImportExpression", {
  message: "Avoid dynamic import(). Use static module imports.",
  meta: { type: "problem" },
})
