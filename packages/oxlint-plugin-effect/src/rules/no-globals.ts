/**
 * Ban global/platform APIs inside Effect.gen/fn context.
 *
 * Consolidates: console, fetch(), Date/new Date, Math.random/crypto,
 * setTimeout/setInterval, JSON.parse/stringify, process/Bun/Deno globals
 *
 * Each has a specific Effect alternative hint.
 *
 * Sources: language-service globalConsoleInEffect, globalFetchInEffect,
 * globalDateInEffect, globalRandomInEffect, globalTimersInEffect,
 * preferSchemaOverJson, processEnvInEffect, cryptoRandomUUIDInEffect
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

// --- Member expression bans (obj.prop) ---

type MemberBan = readonly [obj: string, props: string | ReadonlyArray<string>, message: string]

const memberBans: ReadonlyArray<MemberBan> = [
  // console
  ["console", ["log", "warn", "error", "info", "debug", "trace"], "Avoid console.* inside Effect context. Use Effect.log / Effect.logWarning / Effect.logError."],
  // Date
  ["Date", "now", "Avoid Date.now() inside Effect context. Use Clock service from 'effect'."],
  // JSON
  ["JSON", ["parse", "stringify"], "Avoid JSON.parse/stringify inside Effect context. Use Schema.fromJsonString."],
  // Math.random
  ["Math", "random", "Avoid Math.random() inside Effect context. Use Random service from 'effect'."],
  // crypto
  ["crypto", ["randomUUID", "getRandomValues"], "Avoid crypto.randomUUID() inside Effect context. Use Random service from 'effect'."],
]

// --- Platform globals (Bun.*, process.*, Deno.*) ---

const platformObjects = new Set(["Bun", "process", "Deno"])

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
    randomUUID: "Use Random service from 'effect'",
    randomUUIDv7: "Use Random service from 'effect'",
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

// --- Call expression bans (bare function calls) ---

const callBans: Record<string, string> = {
  fetch: "Avoid fetch() inside Effect context. Use HttpClient from 'effect/unstable/http'.",
  setTimeout: "Avoid setTimeout inside Effect context. Use Effect.sleep or Schedule.",
  setInterval: "Avoid setInterval inside Effect context. Use Effect.sleep or Schedule.",
}

export const noGlobals = Rule.define({
  name: "no-globals",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid global/platform APIs inside Effect.gen/fn. Use Effect platform services instead.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      // Member expressions: console.log, Date.now, JSON.parse, Math.random, process.env, Bun.*, etc.
      MemberExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d <= 0) return Effect.void
          const memberNode = node as ESTree.MemberExpression

          // Check specific member bans
          for (const [obj, props, message] of memberBans) {
            if (Option.isSome(AST.matchMember(memberNode, obj, props))) {
              return ctx.report(Diagnostic.make({ node, message }))
            }
          }

          // Check platform globals (Bun.*, process.*, Deno.*)
          const names = Option.getOrUndefined(AST.memberNames(memberNode))
          if (names !== undefined) {
            const [obj, prop] = names
            if (platformObjects.has(obj)) {
              return ctx.report(
                Diagnostic.make({
                  node,
                  message: `Avoid ${obj}.${prop} inside Effect context${getHint(obj, prop)}.`,
                }),
              )
            }
          }

          return Effect.void
        }),

      // Call expressions: fetch(), setTimeout(), setInterval()
      CallExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d <= 0) return Effect.void
          const name = Option.getOrUndefined(AST.calleeName(node as ESTree.CallExpression))
          const message = name !== undefined ? callBans[name] : undefined
          if (message !== undefined) {
            return ctx.report(Diagnostic.make({ node, message }))
          }
          return Effect.void
        }),

      // New expressions: new Date()
      NewExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d <= 0) return Effect.void
          const callee = (node as unknown as Record<string, unknown>)["callee"] as ESTree.Node
          if (callee.type === "Identifier" && "name" in callee && callee.name === "Date") {
            return ctx.report(
              Diagnostic.make({ node, message: "Avoid new Date() inside Effect context. Use Clock service from 'effect'." }),
            )
          }
          return Effect.void
        }),
    })
  },
})
