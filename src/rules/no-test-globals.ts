/** Ban writes to shared global state, global stubbing helpers, and implicit test-runner globals. */
import type { ESTree, Reference, Scope as OxlintScope } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { collectTestBindings, resolveTestBinding, type TestBinding } from "./_test-apis.js";
import { isTestModule, skipFile } from "./_test-files.js";

const globalRoots = new Set(["global", "globalThis", "self", "window"]);

const mutatingCalls = new Map([
  ["Object", new Set(["assign", "defineProperties", "defineProperty"])],
  ["Reflect", new Set(["defineProperty", "deleteProperty", "set"])],
]);

const stubbingMethods = new Set([
  "replaceProperty",
  "stubEnv",
  "stubGlobal",
  "unstubAllEnvs",
  "unstubAllGlobals",
]);

const runnerGlobals = new Set([
  "afterAll",
  "afterEach",
  "beforeAll",
  "beforeEach",
  "describe",
  "expect",
  "fdescribe",
  "fit",
  "it",
  "jest",
  "mock",
  "spyOn",
  "test",
  "vi",
  "xdescribe",
  "xit",
  "xtest",
]);

/** Calls whose function arguments run as cleanup, and the first argument index that does. */
const cleanupCalls: ReadonlyMap<string, number> = new Map([
  ["afterEach", 0],
  ["afterAll", 0],
  ["addFinalizer", 0],
  ["ensuring", 0],
  ["onExit", 0],
  ["acquireRelease", 1],
  ["acquireUseRelease", 2],
]);

const calleeName = (call: ESTree.CallExpression): Option.Option<string> => {
  const callee = call.callee;
  if (callee.type === "Identifier") return Option.some(callee.name);
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier")
    return Option.some(callee.property.name);
  return Option.none();
};

/**
 * Whether `node` runs as cleanup: in a `finally` block, or in a function passed as
 * the cleanup of `afterEach`, `afterAll`, `addFinalizer`, `ensuring`, `onExit` or
 * the release of `acquireRelease`. Such a write restores what the test saved; the
 * write that changed the global is the one reported.
 */
const isCleanup = (node: ESTree.Node): boolean => {
  let child: ESTree.Node = node;
  for (let parent = child.parent; parent; child = parent, parent = parent.parent) {
    if (parent.type === "TryStatement" && parent.finalizer === child) return true;
    if (parent.type === "CallExpression" && child !== parent.callee) {
      const index = parent.arguments.findIndex((argument) => argument === child);
      const from = Option.flatMap(calleeName(parent), (name) =>
        Option.fromUndefinedOr(cleanupCalls.get(name)),
      );
      if (index >= 0 && Option.exists(from, (first) => index >= first)) return true;
    }
  }
  return false;
};

const capabilityHint = "Provide the capability through an Effect service or runtime input.";

const innermostMember = (node: ESTree.MemberExpression): ESTree.MemberExpression => {
  if (node.object.type === "MemberExpression") return innermostMember(node.object);
  return node;
};

const isStaticProperty = (node: ESTree.MemberExpression, name: string): boolean =>
  !node.computed && node.property.type === "Identifier" && node.property.name === name;

/**
 * References to runner names that no import or declaration provides: unresolved
 * references, plus references to globals the linter configuration declares.
 */
const runnerGlobalReferences = (globalScope: OxlintScope): ReadonlyArray<Reference> => {
  const ambient = Scope.variables(globalScope)
    .filter((variable) => variable.defs.length === 0)
    .flatMap((variable) => Scope.getReferences(variable));
  const referenceByIdentifier = new Map(
    [...Scope.throughReferences(globalScope), ...ambient].map(
      (reference) => [reference.identifier, reference] as const,
    ),
  );
  return [...referenceByIdentifier.values()].filter((reference) =>
    runnerGlobals.has(reference.identifier.name),
  );
};

export const noTestGlobals = Rule.define({
  name: "no-test-globals",
  meta: Rule.meta({
    type: "problem",
    description: "Keep tests off shared global state and implicit test globals.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    // Application code owns its globals; this rule is about test isolation.
    if (!isTestModule(ctx)) return skipFile;
    const bindings = new Map<string, TestBinding>();

    const isUnshadowedGlobal = (node: ESTree.Node, name: string): boolean =>
      Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(node), name), {
        onNone: () => true,
        onSome: (variable) => variable.defs.length === 0,
      });

    const isGlobalRoot = (node: ESTree.Node): boolean =>
      node.type === "Identifier" &&
      globalRoots.has(node.name) &&
      isUnshadowedGlobal(node, node.name);

    /** A global object, a member chain rooted at one, or a chain rooted at `process.env`. */
    const isGlobalState = (node: ESTree.Node): boolean => {
      if (node.type !== "MemberExpression") return isGlobalRoot(node);
      const innermost = innermostMember(node);
      if (isGlobalRoot(innermost.object)) return true;
      return (
        innermost.object.type === "Identifier" &&
        innermost.object.name === "process" &&
        isStaticProperty(innermost, "env") &&
        isUnshadowedGlobal(innermost, "process")
      );
    };

    const reportWrite = (target: ESTree.Node) => {
      if (target.type !== "MemberExpression" || !isGlobalState(target) || isCleanup(target))
        return Effect.void;
      return ctx.report(
        Diagnostic.make({
          node: target,
          message: `Avoid writing ${ctx.sourceCode.getText(target)} in tests. ${capabilityHint}`,
        }),
      );
    };

    const mutatedGlobal = (call: ESTree.CallExpression): Option.Option<string> => {
      if (call.callee.type !== "MemberExpression") return Option.none();
      const target = Option.filter(
        Option.fromUndefinedOr(call.arguments[0]),
        (argument) => argument.type !== "SpreadElement" && isGlobalState(argument),
      );
      if (Option.isNone(target)) return Option.none();
      return Option.map(
        Option.filter(
          AST.memberNames(call.callee),
          ([object, method]) =>
            Option.exists(Option.fromUndefinedOr(mutatingCalls.get(object)), (methods) =>
              methods.has(method),
            ) && isUnshadowedGlobal(call, object),
        ),
        ([object, method]) => `${object}.${method}() on ${ctx.sourceCode.getText(target.value)}`,
      );
    };

    const stubbingCall = (call: ESTree.CallExpression): Option.Option<string> => {
      if (call.callee.type !== "MemberExpression") return Option.none();
      const scope = ctx.sourceCode.getScope(call);
      return Option.flatMap(
        Option.filter(AST.memberNames(call.callee), ([, method]) => stubbingMethods.has(method)),
        ([object, method]) =>
          Option.map(
            Option.filter(
              resolveTestBinding(scope, object, bindings),
              (binding) => binding === "jest" || binding === "vi",
            ),
            (binding) => `${binding}.${method}()`,
          ),
      );
    };

    const reportCall = (call: ESTree.CallExpression) =>
      Option.match(
        Option.filter(
          Option.orElse(mutatedGlobal(call), () => stubbingCall(call)),
          () => !isCleanup(call),
        ),
        {
          onNone: () => Effect.void,
          onSome: (used) =>
            ctx.report(
              Diagnostic.make({ node: call, message: `Avoid ${used} in tests. ${capabilityHint}` }),
            ),
        },
      );

    const reportRunnerGlobal = (reference: Reference) =>
      ctx.report(
        Diagnostic.make({
          node: reference.identifier,
          message: `Import ${reference.identifier.name} from your test library instead of using the runner global.`,
        }),
      );

    return {
      ImportDeclaration: (node) => {
        collectTestBindings(node, bindings);
        return Effect.void;
      },
      AssignmentExpression: (node) =>
        Option.match(AST.narrow(node, "AssignmentExpression"), {
          onNone: () => Effect.void,
          onSome: (assignment) => reportWrite(assignment.left),
        }),
      UpdateExpression: (node) =>
        Option.match(AST.narrow(node, "UpdateExpression"), {
          onNone: () => Effect.void,
          onSome: (update) => reportWrite(update.argument),
        }),
      UnaryExpression: (node) =>
        Option.match(
          Option.filter(
            AST.narrow(node, "UnaryExpression"),
            (unary) => unary.operator === "delete",
          ),
          {
            onNone: () => Effect.void,
            onSome: (unary) => reportWrite(unary.argument),
          },
        ),
      CallExpression: (node) =>
        Option.match(AST.narrow(node, "CallExpression"), {
          onNone: () => Effect.void,
          onSome: reportCall,
        }),
      "Program:exit": () =>
        Option.match(Option.fromNullishOr(ctx.sourceCode.scopeManager.globalScope), {
          onNone: () => Effect.void,
          onSome: (globalScope) =>
            Effect.forEach(runnerGlobalReferences(globalScope), reportRunnerGlobal, {
              discard: true,
            }),
        }),
    };
  },
});
