/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import * as Option from "effect/Option";
import { resolveVariable } from "./_anti-slop-scope.js";

import type { ESTree, SourceCode } from "@oxlint/plugins";

// Local change: reads the Option-returning resolveVariable.
function isGlobalReflect(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
  if (expression.type !== "Identifier" || expression.name !== "Reflect") return false;
  if (sourceCode.isGlobalReference(expression)) return true;
  return Option.match(resolveVariable(sourceCode, expression), {
    onNone: () => true,
    onSome: (variable) => variable.defs.length === 0,
  });
}

/** Reports whether a call target names one method on the global Reflect object. */
// Local change: the computed-access ternary is an early return.
export function isGlobalReflectMethodCall(
  sourceCode: SourceCode,
  callee: ESTree.Expression,
  methodName: string,
): boolean {
  if (!("property" in callee) || !("object" in callee) || !("computed" in callee)) return false;
  if (!isGlobalReflect(sourceCode, callee.object)) return false;
  const property = callee.property;
  if (callee.computed) return property.type === "Literal" && property.value === methodName;
  return property.type === "Identifier" && property.name === methodName;
}
