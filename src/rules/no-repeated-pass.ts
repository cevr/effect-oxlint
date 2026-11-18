/**
 * Several passes over one unchanged array in one block are one loop.
 *
 * Reported: the second and later `filter`, `reduce`, `some`, `every`, `find`
 * or `findIndex` call over the same known array (by the array evidence of
 * `noArrayFilterMap`: an array literal, an array-typed binding, or a
 * `const` built by an array method) that run on the same straight-line path
 * of one block: not in a branch, a loop body, a callback or the right side of
 * `&&`/`||`, with no `return`, `throw`, `break` or `continue` between them.
 * Not reported: a pass that reads a name declared beside an earlier pass (the
 * second needs the first's result, as a variance needs the mean), an array
 * the block reassigns or mutates (`push`, `splice`, `sort`, …), and test
 * modules. Each pass reads every element again: k passes cost k × n callback
 * calls where one loop costs n. Counted cost: `tests/perf/no-repeated-pass.ts`.
 * Source: the react skill, `performance.md` "Combine multiple iterations";
 * vercel `js-combine-iterations` (catalog SR-P04).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { childrenOf, contains, isFunction, walk } from "./_anti-slop-effect.js";
import {
  arrayMethodTarget,
  isKnownArrayExpression,
  unwrapArrayExpression,
} from "./_anti-slop-array-method.js";
import { patternNames } from "./_loops.js";
import { isTestModule, skipFile } from "./_test-files.js";

const passMethods: ReadonlySet<string> = new Set([
  "filter",
  "reduce",
  "some",
  "every",
  "find",
  "findIndex",
]);
const mutators: ReadonlySet<string> = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);
const nested: ReadonlySet<string> = new Set([
  "BlockStatement",
  "ForStatement",
  "ForOfStatement",
  "ForInStatement",
  "WhileStatement",
  "DoWhileStatement",
  "TryStatement",
]);
const exitTypes: ReadonlySet<string> = new Set([
  "ReturnStatement",
  "ThrowStatement",
  "BreakStatement",
  "ContinueStatement",
]);

interface Pass {
  readonly call: ESTree.CallExpression;
  readonly array: string;
  readonly method: string;
}

/** The array an identifier-receiver call is made on, with the method's name. */
const receiverCall = (
  node: ESTree.Node,
): Option.Option<{ readonly receiver: ESTree.Node; readonly array: string; readonly method: string }> => {
  if (node.type !== "CallExpression") return Option.none();
  return Option.flatMap(arrayMethodTarget(node.callee), (method) => {
    const receiver = unwrapArrayExpression(method.object);
    if (receiver.type !== "Identifier") return Option.none();
    return Option.some({ receiver, array: receiver.name, method: method.name });
  });
};

/** The children of a node that run each time the node runs: no branch, loop body or callback. */
const onceChildren = (node: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  if (isFunction(node) || nested.has(node.type)) return [];
  if (node.type === "IfStatement" || node.type === "ConditionalExpression") return [node.test];
  if (node.type === "SwitchStatement") return [node.discriminant];
  if (node.type === "LogicalExpression") return [node.left];
  return childrenOf(node);
};

/** Nodes of a statement on its straight-line path, in source order. */
const straightLine = (node: ESTree.Node): ReadonlyArray<ESTree.Node> => [
  node,
  ...onceChildren(node).flatMap(straightLine),
];

/** Whether a statement may leave the block (outside nested functions). */
const mayExit = (statement: ESTree.Node): boolean => {
  let exits = false;
  walk(statement, (node) => {
    if (exitTypes.has(node.type)) exits = true;
    return !isFunction(node);
  });
  return exits;
};

const declaredNames = (statement: ESTree.Node): ReadonlyArray<string> => {
  if (statement.type !== "VariableDeclaration") return [];
  return statement.declarations.flatMap((declaration) => patternNames(declaration.id));
};

const readsAny = (node: ESTree.Node, names: ReadonlySet<string>): boolean =>
  names.size > 0 &&
  contains(node, (child) => child.type === "Identifier" && names.has(child.name));

/** Arrays a block reassigns or mutates anywhere in it. */
const changedArrays = (statements: ReadonlyArray<ESTree.Node>): ReadonlySet<string> => {
  const changed = new Set<string>();
  for (const statement of statements) {
    walk(statement, (node) => {
      if (node.type === "AssignmentExpression" && node.left.type === "Identifier") {
        changed.add(node.left.name);
      }
      Option.map(
        Option.filter(receiverCall(node), ({ method }) => mutators.has(method)),
        ({ array }) => changed.add(array),
      );
      return true;
    });
  }
  return changed;
};

export const noRepeatedPass = Rule.define({
  name: "no-repeated-pass",
  meta: Rule.meta({
    type: "suggestion",
    description: "Combine several passes over one unchanged array in a block into one loop.",
    docs: { recommended: false, preset: "skills-perf" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;

    const passesIn = (statement: ESTree.Node): ReadonlyArray<Pass> =>
      straightLine(statement).flatMap((node) =>
        Option.match(receiverCall(node), {
          onNone: () => [],
          onSome: ({ receiver, array, method }) => {
            const known =
              node.type === "CallExpression" &&
              passMethods.has(method) &&
              isKnownArrayExpression(ctx.sourceCode, receiver);
            if (!known) return [];
            return [{ call: node, array, method }];
          },
        }),
      );

    /** Later passes over an array an earlier pass on the same path read, that do not need its result. */
    const scan = (statements: ReadonlyArray<ESTree.Node>): ReadonlyArray<Pass> => {
      const changed = changedArrays(statements);
      let earlier: Array<{ readonly array: string; readonly declared: ReadonlyArray<string> }> = [];
      const repeated: Array<Pass> = [];
      for (const statement of statements) {
        const declared = declaredNames(statement);
        for (const pass of passesIn(statement)) {
          const before = earlier.filter((p) => p.array === pass.array);
          const needs = new Set(before.flatMap((p) => p.declared));
          if (before.length > 0 && !changed.has(pass.array) && !readsAny(pass.call, needs)) {
            repeated.push(pass);
          }
          earlier.push({ array: pass.array, declared });
        }
        if (mayExit(statement)) earlier = [];
      }
      return repeated;
    };

    const report = (statements: ReadonlyArray<ESTree.Node>) =>
      Effect.forEach(
        scan(statements),
        (pass) =>
          ctx.report(
            Diagnostic.make({
              node: pass.call,
              message: `\`${pass.array}.${pass.method}(…)\` reads every element of \`${pass.array}\` again after an earlier pass on the same path, so k passes cost k × n callback calls. Do the work in one loop (\`for (const x of ${pass.array}) { … }\` that fills each result), or one \`reduce\` that returns all of them.`,
            }),
          ),
        { discard: true },
      );

    return {
      BlockStatement: (node: ESTree.BlockStatement) => report(node.body),
      Program: (node: ESTree.Program) => report(node.body),
    };
  },
});
