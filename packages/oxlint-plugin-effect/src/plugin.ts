/**
 * The Effect oxlint plugin — all rules registered under the "effect" prefix.
 *
 * Load this in your `.oxlintrc.json`:
 * ```json
 * { "jsPlugins": ["effect-oxlint-plugin/plugin"] }
 * ```
 */
import { Plugin } from "./vendor/effect-oxlint/index.js"

import * as rules from "./rules/index.js"

export default Plugin.define({
  name: "effect",
  rules,
})
