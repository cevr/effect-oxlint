/**
 * Ban platform-specific global access inside Effect.gen/fn context.
 *
 * Catches `Bun.*`, `process.*`, `Deno.*` — any runtime-specific API
 * that should be wrapped in an Effect service for testability and portability.
 *
 * Provides Effect alternative hints where known.
 *
 * Sources: language-service/processEnv, processEnvInEffect + generalized
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

const platformObjects = new Set(["Bun", "process", "Deno"])

/**
 * Map of `Object.property` → Effect alternative hint.
 * Falls back to a generic message for unknown properties.
 */
const alternatives: Record<string, Record<string, string>> = {
  Bun: {
    file: "Use FileSystem from 'effect'",
    write: "Use FileSystem from 'effect'",
    read: "Use FileSystem from 'effect'",
    serve: "Use HttpServer from 'effect/unstable/http'",
    env: "Use Config from 'effect'",
    spawn: "Use Command from 'effect'",
    sleep: "Use Effect.sleep",
    stdin: "Use Terminal from 'effect'",
    stdout: "Use Terminal from 'effect'",
    stderr: "Use Terminal from 'effect'",
    cwd: "Use Path from 'effect'",
    which: "Use Command from 'effect'",
    resolveSync: "Use Path from 'effect'",
    pathToFileURL: "Use Path from 'effect'",
  },
  process: {
    env: "Use Config from 'effect'",
    exit: "Use Effect.fail or Effect.die",
    cwd: "Use Path from 'effect'",
    argv: "Use Args/Command from 'effect/unstable/cli'",
    stdin: "Use Terminal from 'effect'",
    stdout: "Use Terminal from 'effect'",
    stderr: "Use Terminal from 'effect'",
    chdir: "Use Path from 'effect'",
    kill: "Use Command from 'effect'",
    on: "Use Effect.async or Stream.async",
    platform: "Use PlatformInfo from 'effect'",
    arch: "Use PlatformInfo from 'effect'",
    execPath: "Use Command from 'effect'",
    execArgv: "Use Args/Command from 'effect/unstable/cli'",
  },
  Deno: {
    readFile: "Use FileSystem from 'effect'",
    writeFile: "Use FileSystem from 'effect'",
    readTextFile: "Use FileSystem from 'effect'",
    writeTextFile: "Use FileSystem from 'effect'",
    open: "Use FileSystem from 'effect'",
    remove: "Use FileSystem from 'effect'",
    mkdir: "Use FileSystem from 'effect'",
    readDir: "Use FileSystem from 'effect'",
    stat: "Use FileSystem from 'effect'",
    cwd: "Use Path from 'effect'",
    env: "Use Config from 'effect'",
    exit: "Use Effect.fail or Effect.die",
    serve: "Use HttpServer from 'effect/unstable/http'",
    run: "Use Command from 'effect'",
    args: "Use Args/Command from 'effect/unstable/cli'",
  },
}

function getHint(obj: string, prop: string): string {
  const hint = alternatives[obj]?.[prop]
  if (hint) return `. ${hint}`
  return ". Wrap in a service for testability"
}

export const noPlatformGlobals = Rule.define({
  name: "no-platform-globals",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid platform globals (Bun.*, process.*, Deno.*) inside Effect context. Use Effect platform services.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      MemberExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d <= 0) return Effect.void

          const names = Option.getOrUndefined(
            AST.memberNames(node as ESTree.MemberExpression),
          )
          if (names === undefined) return Effect.void

          const [obj, prop] = names
          if (!platformObjects.has(obj)) return Effect.void

          return ctx.report(
            Diagnostic.make({
              node,
              message: `Avoid ${obj}.${prop} inside Effect context${getHint(obj, prop)}.`,
            }),
          )
        }),
    })
  },
})
