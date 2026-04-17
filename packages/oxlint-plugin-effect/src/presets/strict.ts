/**
 * strict — composable axes for error-level Effect linting.
 *
 * Each axis is independently layerable:
 *
 * ```ts
 * import { strict, full } from "oxlint-plugin-effect/presets"
 *
 * // gentle: full + effect correctness at error, no style/control-flow
 * rules: { ...full, ...strict.core }
 *
 * // no if/ternary but keep switch
 * rules: {
 *   ...full,
 *   ...strict.core,
 *   ...strict.controlFlow,
 *   "effect/noSwitchStatement": "off",
 * }
 *
 * // everything
 * rules: { ...strict.all }
 * ```
 *
 * Axes:
 * - `core`        — API bans + AST correctness + enforcing bans (~50 rules)
 * - `controlFlow` — noIfStatement / noTernary / noSwitchStatement / noReturnInArrow
 * - `style`       — noArrowLadder / noStringSentinelConst / noUnnecessaryArrowBlock / noIifeWrapper
 * - `all`         — every axis merged
 */
import { strictCore } from "./strict-core.js"
import { strictControlFlow } from "./strict-control-flow.js"
import { strictStyle } from "./strict-style.js"

export const strict = {
  core: strictCore,
  controlFlow: strictControlFlow,
  style: strictStyle,
  all: { ...strictCore, ...strictControlFlow, ...strictStyle },
} as const
