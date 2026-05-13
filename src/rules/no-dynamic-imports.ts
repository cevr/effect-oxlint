/**
 * Ban dynamic module loading.
 *
 * Dynamic import/require paths hide dependency edges from static analysis and
 * compiled-binary bundling. Use static imports unless the call site opts out
 * with an adjacent `effect/no-dynamic-imports: allow <reason>` comment.
 */
import type { Comment, ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

interface AstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

const allowPattern = /\beffect\/no-dynamic-imports:\s*allow\s+\S/;

const isAstNode = (value: unknown): value is AstNode =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const getNodeField = (node: AstNode, field: string): AstNode | undefined => {
  const value = node[field];
  return isAstNode(value) ? value : undefined;
};

const getStringField = (node: AstNode, field: string): string | undefined => {
  const value = node[field];
  return typeof value === "string" ? value : undefined;
};

const getLine = (node: AstNode, edge: "start" | "end"): number | undefined => {
  const loc = node["loc"];
  if (typeof loc !== "object" || loc === null) return undefined;
  const point = (loc as Record<string, unknown>)[edge];
  if (typeof point !== "object" || point === null) return undefined;
  const line = (point as Record<string, unknown>)["line"];
  return typeof line === "number" ? line : undefined;
};

const hasAllowComment = (node: AstNode, comments: ReadonlyArray<Comment>): boolean => {
  const startLine = getLine(node, "start");
  if (startLine === undefined) return false;
  return comments.some((comment) => {
    const endLine = getLine(comment as unknown as AstNode, "end");
    if (endLine === undefined) return false;
    if (endLine !== startLine - 1 && endLine !== startLine) return false;
    return allowPattern.test(comment.value);
  });
};

const createRequireAliasName = (node: AstNode): string | undefined => {
  if (node.type !== "VariableDeclarator") return undefined;
  const id = getNodeField(node, "id");
  const init = getNodeField(node, "init");
  if (id?.type !== "Identifier" || init?.type !== "CallExpression") return undefined;
  const callee = getNodeField(init, "callee");
  if (callee?.type !== "Identifier" || getStringField(callee, "name") !== "createRequire")
    return undefined;
  return getStringField(id, "name");
};

const classifyDynamicLoadCall = (
  callee: AstNode | undefined,
  createRequireAliases: ReadonlySet<string>,
): string | undefined => {
  if (callee === undefined) return undefined;
  if (callee.type === "Identifier") {
    const name = getStringField(callee, "name");
    if (name === "require") return "`require(...)` is forbidden. Use a top-level static import.";
    if (name !== undefined && createRequireAliases.has(name))
      return "`createRequire(...)` aliases are forbidden. Use a top-level static import.";
  }
  if (callee.type === "MemberExpression") {
    const object = getNodeField(callee, "object");
    const property = getNodeField(callee, "property");
    if (
      object?.type === "Identifier" &&
      getStringField(object, "name") === "module" &&
      property?.type === "Identifier" &&
      getStringField(property, "name") === "require"
    ) {
      return "`module.require(...)` is forbidden. Use a top-level static import.";
    }
  }
  if (callee.type === "CallExpression") {
    const inner = getNodeField(callee, "callee");
    if (inner?.type === "Identifier" && getStringField(inner, "name") === "createRequire") {
      return "`createRequire(...)(...)` is forbidden. Use a top-level static import.";
    }
  }
  return undefined;
};

export const noDynamicImports = Rule.define({
  name: "no-dynamic-imports",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid dynamic import/require. Use top-level static imports.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const createRequireAliases = new Set<string>();
    const reportUnlessAllowed = (node: ESTree.Node, message: string) =>
      hasAllowComment(node as unknown as AstNode, ctx.sourceCode.getAllComments())
        ? Effect.void
        : ctx.report(Diagnostic.make({ node, message }));

    return {
      VariableDeclarator: (node: ESTree.Node) => {
        const alias = createRequireAliasName(node as unknown as AstNode);
        if (alias === undefined) return Effect.void;
        createRequireAliases.add(alias);
        return reportUnlessAllowed(
          node,
          "`createRequire(...)` is forbidden. Use a top-level static import.",
        );
      },
      ImportExpression: (node: ESTree.Node) =>
        reportUnlessAllowed(
          node,
          "Dynamic `import(...)` is forbidden. Use a top-level static import.",
        ),
      CallExpression: (node: ESTree.Node) => {
        const call = node as unknown as AstNode;
        const message = classifyDynamicLoadCall(getNodeField(call, "callee"), createRequireAliases);
        return message === undefined ? Effect.void : reportUnlessAllowed(node, message);
      },
    };
  },
});
