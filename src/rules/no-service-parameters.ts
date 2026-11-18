/**
 * Services reach an operation through R, not through its parameters.
 *
 * Reported: a parameter typed `Context.Context`, `ManagedRuntime.ManagedRuntime`,
 * `Layer.Layer`, or a Context.Service class declared in the same file. A layer
 * combinator (a function that declares or evidently returns a Layer) may take a
 * Layer, and a callback passed to an Effect API keeps the parameter type the
 * API dictates. Test files are skipped. Local change: a carrier parameter
 * (Context, ManagedRuntime, Layer) is reported only on an Effect operation
 * (a declared Effect return type, or a body that evidently returns an
 * Effect); a function at a boundary takes one because providing it is its
 * job (BL2's Bite reads: test-runner APIs, provide helpers, app and runtime
 * construction). Ported from K-Mistele/anti-slop
 * (`no-service-parameters`, b7c1619, MIT; THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import {
  effectModuleNames,
  isFunction,
  moduleCall,
  pipeReceiver,
  serviceClass,
  unwrap,
  walk,
} from "./_anti-slop-effect.js";
import type { EffectModule, EffectModuleNames } from "./_anti-slop-effect.js";
import { isTestModule, skipFile } from "./_test-files.js";

/** Module type names that carry services: `Context.Context`, `ManagedRuntime.ManagedRuntime`, `Layer.Layer`. */
const carrierModules: ReadonlyArray<EffectModule> = ["Context", "ManagedRuntime", "Layer"];
const effectApiModules: ReadonlyArray<EffectModule> = [
  "Context",
  "Effect",
  "Layer",
  "ManagedRuntime",
];

/** The carrier module of a `Module.Type<...>` reference. */
const carrierModule = (
  type: ESTree.TSType,
  names: EffectModuleNames,
): Option.Option<EffectModule> => {
  if (type.type !== "TSTypeReference" || type.typeName.type !== "TSQualifiedName") {
    return Option.none();
  }
  const { left, right } = type.typeName;
  if (left.type !== "Identifier") return Option.none();
  return Option.fromUndefinedOr(
    carrierModules.find(
      (module) => right.name === module && (names.get(module)?.has(left.name) ?? false),
    ),
  );
};

/** The name of a same-file service class a type refers to. */
const serviceClassName = (
  type: ESTree.TSType,
  services: ReadonlySet<string>,
): Option.Option<string> => {
  if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return Option.none();
  const name = type.typeName.name;
  return Option.liftPredicate(name, (candidate: string) => services.has(candidate));
};

type Parameter = ESTree.ParamPattern;

/** The pattern a parameter binds, under a constructor's parameter property. */
const boundPattern = (parameter: Parameter) => {
  if (parameter.type === "TSParameterProperty") return parameter.parameter;
  return parameter;
};

/** The name a type reference uses, or the whole type. */
const typeNameNode = (type: ESTree.TSType): ESTree.Node => {
  if (type.type === "TSTypeReference") return type.typeName;
  return type;
};

/** A parameter's declared type. */
const parameterType = (parameter: Parameter): Option.Option<ESTree.TSType> => {
  const pattern = boundPattern(parameter);
  if (pattern.type === "AssignmentPattern") {
    return Option.map(
      Option.fromNullishOr(pattern.left.typeAnnotation),
      (annotation) => annotation.typeAnnotation,
    );
  }
  return Option.map(
    Option.fromNullishOr(pattern.typeAnnotation),
    (annotation) => annotation.typeAnnotation,
  );
};

/** Whether an expression is a Layer constructor call or a pipe of Layer combinators. */
const isLayerExpression = (node: ESTree.Node, names: EffectModuleNames): boolean => {
  const expression = unwrap(node);
  if (Option.isSome(moduleCall(expression, names, "Layer"))) return true;
  if (expression.type !== "CallExpression") return false;
  return Option.exists(
    pipeReceiver(expression),
    (receiver) =>
      isLayerExpression(receiver, names) ||
      expression.arguments.some((step) => Option.isSome(moduleCall(step, names, "Layer"))),
  );
};

/** A callback passed to an Effect API, whose parameter type the API dictates. */
const isEffectApiCallback = (fn: ESTree.Node, names: EffectModuleNames): boolean => {
  const parent = fn.parent;
  if (parent?.type !== "CallExpression") return false;
  if (!parent.arguments.some((argument) => argument === fn)) return false;
  return effectApiModules.some((module) => Option.isSome(moduleCall(parent, names, module)));
};

type Signature =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

/** Whether the function is a layer combinator: it declares or evidently returns a Layer. */
const returnsLayer = (fn: Signature, names: EffectModuleNames): boolean => {
  const declared = Option.flatMap(
    Option.map(Option.fromNullishOr(fn.returnType), (annotation) => annotation.typeAnnotation),
    (type) => carrierModule(type, names),
  );
  if (Option.contains(declared, "Layer")) return true;
  return (
    fn.type === "ArrowFunctionExpression" &&
    fn.body.type !== "BlockStatement" &&
    isLayerExpression(fn.body, names)
  );
};

/** Whether a type is `Effect.Effect<…>` under one of the file's names for Effect. */
const isEffectType = (type: ESTree.TSType, names: EffectModuleNames): boolean =>
  type.type === "TSTypeReference" &&
  type.typeName.type === "TSQualifiedName" &&
  type.typeName.left.type === "Identifier" &&
  type.typeName.right.name === "Effect" &&
  (names.get("Effect")?.has(type.typeName.left.name) ?? false);

/** Whether an expression builds an Effect: `Effect.x(…)`, `Effect.fn(…)(…)`, or a pipe of one. */
const isEffectExpression = (node: ESTree.Node, names: EffectModuleNames): boolean => {
  const expression = unwrap(node);
  if (expression.type !== "CallExpression") return false;
  // `Effect.run*` leaves Effect: its result is a Promise, an Exit or a value.
  const builds = (member: string) => !member.startsWith("run");
  if (Option.exists(moduleCall(expression, names, "Effect"), builds)) return true;
  if (Option.exists(moduleCall(expression.callee, names, "Effect"), builds)) return true;
  return Option.exists(
    pipeReceiver(expression),
    (receiver) =>
      isEffectExpression(receiver, names) ||
      expression.arguments.some((step) => Option.isSome(moduleCall(step, names, "Effect"))),
  );
};

/**
 * Whether the function is an Effect operation: it declares an Effect return
 * type, or its body evidently returns an Effect. Only an operation has an R
 * channel for its services; a function at a boundary (a test runner's
 * `layer` API, a `provide*` helper returning a function, app or runtime
 * construction returning a Promise, a runtime, void) takes the layer or
 * runtime because providing it is its job.
 */
const isEffectOperation = (fn: Signature, names: EffectModuleNames): boolean => {
  const declared = Option.map(
    Option.fromNullishOr(fn.returnType),
    (annotation) => annotation.typeAnnotation,
  );
  if (Option.isSome(declared)) return isEffectType(declared.value, names);
  if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression" && fn.type !== "FunctionDeclaration") {
    return false;
  }
  const body = fn.body;
  if (!body) return false;
  if (body.type !== "BlockStatement") return isEffectExpression(body, names);
  let returnsEffect = false;
  walk(body, (node) => {
    if (isFunction(node)) return false;
    if (node.type === "ReturnStatement" && node.argument && isEffectExpression(node.argument, names)) {
      returnsEffect = true;
    }
    return !returnsEffect;
  });
  return returnsEffect;
};

/** The Context.Service classes the file declares, by name. */
const serviceNames = (program: ESTree.Program, names: EffectModuleNames): ReadonlySet<string> => {
  const services = new Set<string>();
  walk(program, (node) => {
    if (node.type !== "ClassDeclaration" && node.type !== "ClassExpression") return true;
    Option.map(serviceClass(node, names), (service) =>
      Option.map(service.name, (name) => services.add(name)),
    );
    return true;
  });
  return services;
};

const carrierMessage = (type: string): string =>
  `Do not pass a \`${type}\` as a parameter: it hands the operation a whole environment instead of the services it needs. \`yield*\` those services inside it (\`const store = yield* Store\`) and let its requirements flow through R to the runtime that provides them; pass only plain values.`;

const serviceMessage = (type: string): string =>
  `Do not pass the \`${type}\` service as a parameter: it hides the requirement from the operation's R channel. \`yield* ${type}\` inside the operation and let the requirement flow through R to the layer that provides it; pass only plain values.`;

export const noServiceParameters = Rule.define({
  name: "no-service-parameters",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow function parameters typed as Context.Context, ManagedRuntime.ManagedRuntime, Layer.Layer, or a Context.Service declared in the same file.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const names = effectModuleNames(ctx.sourceCode.ast);
    const services = serviceNames(ctx.sourceCode.ast, names);

    /** The finding for one parameter, if any. */
    const finding = (fn: Signature, parameter: Parameter): Option.Option<string> =>
      Option.flatMap(parameterType(parameter), (type) =>
        Option.match(carrierModule(type, names), {
          onSome: (carrier) => {
            if (carrier === "Layer" && returnsLayer(fn, names)) return Option.none();
            if (!isEffectOperation(fn, names)) return Option.none();
            return Option.some(carrierMessage(ctx.sourceCode.getText(typeNameNode(type))));
          },
          onNone: () => Option.map(serviceClassName(type, services), serviceMessage),
        }),
      );

    const check = (fn: Signature) => {
      if (isEffectApiCallback(fn, names)) return Effect.void;
      return Effect.forEach(
        fn.params,
        (parameter) =>
          Option.match(finding(fn, parameter), {
            onNone: () => Effect.void,
            onSome: (message) => ctx.report(Diagnostic.make({ node: parameter, message })),
          }),
        { discard: true },
      );
    };

    return {
      ArrowFunctionExpression: check,
      FunctionDeclaration: check,
      FunctionExpression: check,
      TSFunctionType: check,
      TSMethodSignature: check,
    };
  },
});
