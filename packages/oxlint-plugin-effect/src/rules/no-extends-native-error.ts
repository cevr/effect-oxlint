/**
 * Ban `class Foo extends Error`.
 *
 * Use Schema.TaggedErrorClass or Data.TaggedError instead.
 *
 * Source: language-service/extendsNativeError
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const nativeErrors = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
])

export const noExtendsNativeError = Rule.define({
  name: "no-extends-native-error",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid extending native Error. Use Schema.TaggedErrorClass or Data.TaggedError.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      ClassDeclaration: (node) => {
        if (
          "superClass" in node &&
          node.superClass != null &&
          typeof node.superClass === "object" &&
          "type" in node.superClass &&
          node.superClass.type === "Identifier" &&
          "name" in node.superClass &&
          typeof node.superClass.name === "string" &&
          nativeErrors.has(node.superClass.name)
        ) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Avoid extending native Error. Use Schema.TaggedErrorClass or Data.TaggedError.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})
