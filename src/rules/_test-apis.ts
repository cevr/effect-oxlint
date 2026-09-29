/** Resolve test-runner bindings (`vi`, `jest`, bun:test `mock` and `spyOn`) through imports and scope. */
import type { ESTree, Scope as OxlintScope, Variable } from "@oxlint/plugins";
import { AST, Scope } from "../vendor/effect-oxlint/index.js";
import * as Option from "effect/Option";

export type TestBinding = "jest" | "mock" | "spyOn" | "vi";

const bindingsBySource = new Map<string, ReadonlyMap<string, TestBinding>>([
  ["vitest", new Map<string, TestBinding>([["vi", "vi"]])],
  ["@jest/globals", new Map<string, TestBinding>([["jest", "jest"]])],
  [
    "bun:test",
    new Map<string, TestBinding>([
      ["jest", "jest"],
      ["mock", "mock"],
      ["spyOn", "spyOn"],
      ["vi", "vi"],
    ]),
  ],
]);

/** Runner objects that exist as ambient globals when no import provides them. */
const globalBinding = (name: string): Option.Option<TestBinding> => {
  if (name === "jest" || name === "vi") return Option.some(name);
  return Option.none();
};

const identifierName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "Identifier") return Option.some(node.name);
  return Option.none();
};

/** Record each named import of a runner binding under its local name. */
export const collectTestBindings = (
  node: ESTree.Node,
  bindings: Map<string, TestBinding>,
): void => {
  const declaration = AST.narrow(node, "ImportDeclaration");
  if (Option.isNone(declaration)) return;
  const bySource = Option.fromUndefinedOr(
    bindingsBySource.get(AST.importSource(declaration.value)),
  );
  if (Option.isNone(bySource)) return;
  for (const specifier of declaration.value.specifiers) {
    if (specifier.type !== "ImportSpecifier") continue;
    const binding = Option.flatMap(identifierName(specifier.imported), (imported) =>
      Option.fromUndefinedOr(bySource.value.get(imported)),
    );
    if (Option.isSome(binding)) bindings.set(specifier.local.name, binding.value);
  }
};

const bindingFromVariable = (
  variable: Variable,
  bindings: ReadonlyMap<string, TestBinding>,
): Option.Option<TestBinding> => {
  if (variable.defs.some((definition) => definition.type === "ImportBinding")) {
    return Option.fromUndefinedOr(bindings.get(variable.name));
  }
  return Option.none();
};

/** The runner binding `name` refers to at `scope`: an imported binding, or the unshadowed global. */
export const resolveTestBinding = (
  scope: OxlintScope,
  name: string,
  bindings: ReadonlyMap<string, TestBinding>,
): Option.Option<TestBinding> =>
  Option.match(Scope.findVariableUp(scope, name), {
    onNone: () => globalBinding(name),
    onSome: (variable) =>
      Option.orElse(bindingFromVariable(variable, bindings), () =>
        Option.filter(globalBinding(name), () => variable.defs.length === 0),
      ),
  });
