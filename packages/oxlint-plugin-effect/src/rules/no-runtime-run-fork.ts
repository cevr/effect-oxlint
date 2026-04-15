/**
 * Ban `Runtime.runFork`.
 *
 * Use `forkScoped`, `Stream`, or runtime-provided layers.
 *
 * Source: biome-effect-linting-rules/no-runtime-runfork
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noRuntimeRunFork = Rule.banMember("Runtime", "runFork", {
  message:
    "Avoid Runtime.runFork. Use forkScoped, Stream, or runtime-provided layers.",
  meta: { type: "problem" },
})
