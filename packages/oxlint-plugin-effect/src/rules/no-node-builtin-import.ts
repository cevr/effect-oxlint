/**
 * Ban Node.js builtin imports.
 *
 * Use Effect platform services: FileSystem, Path, HttpClient, Command.
 *
 * Source: language-service/nodeBuiltinImport
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

const hints: Record<string, string> = {
  fs: "Use FileSystem from 'effect'",
  path: "Use Path from 'effect'",
  http: "Use HttpClient from 'effect/unstable/http'",
  https: "Use HttpClient from 'effect/unstable/http'",
  child_process: "Use Command from 'effect'",
  crypto: "Use a service wrapper",
  os: "Use PlatformInfo from 'effect'",
  net: "Use HttpServer from 'effect/unstable/http'",
  dns: "Use a service wrapper",
  tls: "Use a service wrapper",
  dgram: "Use a service wrapper",
  stream: "Use Stream from 'effect'",
  zlib: "Use a service wrapper",
  readline: "Use Terminal from 'effect'",
  cluster: "Use a service wrapper",
  worker_threads: "Use a service wrapper",
}

const nodeBuiltins = new Set(Object.keys(hints))

const resolveModule = (source: string): string | undefined => {
  const name = source.startsWith("node:") ? source.slice(5) : source
  const base = name.split("/")[0]
  return base !== undefined && nodeBuiltins.has(base) ? base : undefined
}

export const noNodeBuiltinImport = Rule.define({
  name: "no-node-builtin-import",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Node.js builtin imports. Use Effect platform services.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      ImportDeclaration: (node) => {
        const source = Option.getOrUndefined(
          AST.narrow(node, "ImportDeclaration").pipe(Option.map(AST.importSource)),
        )
        if (source === undefined) return Effect.void

        const mod = resolveModule(source)
        if (mod === undefined) return Effect.void

        const hint = hints[mod] ?? "Use an Effect service wrapper"
        return ctx.report(
          Diagnostic.make({
            node,
            message: `Avoid importing '${source}'. ${hint}.`,
          }),
        )
      },
    }
  },
})
