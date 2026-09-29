import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

import { ancestors } from "./_ast-ancestors.js";
import { isStaticCall, isStaticMember } from "./_effect-namespaces.js";

export type EffectProgramKind = "fn" | "fnUntraced" | "gen";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

const isFunction = (node: ESTree.Node): node is FunctionNode =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

/** `Effect.gen(...)`, `Effect.fn(...)`, or `Effect.fnUntraced(...)` called with the program directly. */
const directProgramKind = (
  callee: ESTree.Expression,
  effectNamespaces: ReadonlySet<string>,
): Option.Option<EffectProgramKind> => {
  if (isStaticMember(callee, effectNamespaces, "gen")) return Option.some("gen");
  if (isStaticMember(callee, effectNamespaces, "fn")) return Option.some("fn");
  if (isStaticMember(callee, effectNamespaces, "fnUntraced")) return Option.some("fnUntraced");
  return Option.none();
};

/** `Effect.fn("name")(...)` or `Effect.fnUntraced(options)(...)` called with the program. */
const curriedProgramKind = (
  callee: ESTree.Expression,
  effectNamespaces: ReadonlySet<string>,
): Option.Option<EffectProgramKind> => {
  if (isStaticCall(callee, effectNamespaces, "fn")) return Option.some("fn");
  if (isStaticCall(callee, effectNamespaces, "fnUntraced")) return Option.some("fnUntraced");
  return Option.none();
};

/** The kind of Effect program a function is the body of, when it is an argument of one. */
export const effectProgramKind = (
  node: FunctionNode,
  effectNamespaces: ReadonlySet<string>,
): Option.Option<EffectProgramKind> => {
  const parent = node.parent;
  if (parent?.type !== "CallExpression" || !parent.arguments.includes(node)) return Option.none();
  const callee = parent.callee;
  if (callee.type === "Super") return Option.none();
  return Option.orElse(directProgramKind(callee, effectNamespaces), () =>
    curriedProgramKind(callee, effectNamespaces),
  );
};

/** The nearest enclosing function, when it is the body of an Effect program. */
export const enclosingEffectProgram = (
  node: ESTree.Node,
  effectNamespaces: ReadonlySet<string>,
): Option.Option<readonly [FunctionNode, EffectProgramKind]> =>
  Option.flatMap(Arr.findFirst(ancestors(node), isFunction), (program) =>
    Option.map(effectProgramKind(program, effectNamespaces), (kind) => [program, kind] as const),
  );

export const isInsideEffectProgram = (
  node: ESTree.Node,
  effectNamespaces: ReadonlySet<string>,
): boolean => Option.isSome(enclosingEffectProgram(node, effectNamespaces));
