/**
 * A Solid prop carries a value, not an accessor.
 *
 * Reported, in a file that imports Solid: a member of a component's props
 * type whose type is a function of no arguments (`routes: () => Route[]`,
 * `routes(): Route[]`) or `Accessor<T>`. The props type is the type argument
 * of `Component<P>` (also `ParentComponent`, `VoidComponent`,
 * `FlowComponent`) on a capitalized binding, or the annotation of a
 * capitalized function's first parameter; a type literal, a local interface
 * or type alias, or an intersection of them. Solid's props object is already
 * live: `props.routes` re-reads on every access, so an accessor prop only
 * makes every caller wrap its value in a function, and the type no longer
 * accepts a plain value. Not reported: handlers and callbacks (`on…`, and
 * any function that returns `void`),
 * getters and slots by name (`get…`, `render…`), `children`, and any type
 * that is not a component's props (a context value holds accessors on
 * purpose). Test modules are skipped. Source: `ui/platforms/web/solid.md`
 * §9 "Pass values, not accessors" (TN1-PERSONAL R1).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isFunction, walk } from "./_anti-slop-effect.js";
import { functionName } from "./_react.js";
import { isSolidProgram } from "./_solid.js";
import { isTestModule, skipFile } from "./_test-files.js";

const componentTypes: ReadonlySet<string> = new Set([
  "Component",
  "ParentComponent",
  "VoidComponent",
  "FlowComponent",
]);
const exemptName = /^(?:(?:on|get|render)[A-Z_]|children$)/u;

type TypeNode = ESTree.Node;

const isCapitalized = (name: string): boolean => /^[A-Z]/u.test(name);

/** The props type of a `const X: Component<P> = …` binding. */
const annotatedProps = (declarator: ESTree.VariableDeclarator): Option.Option<TypeNode> => {
  const id = declarator.id;
  if (id.type !== "Identifier" || !isCapitalized(id.name)) return Option.none();
  return Option.flatMap(Option.fromNullishOr(id.typeAnnotation), (annotation) => {
    const reference = annotation.typeAnnotation;
    const isComponentType =
      reference.type === "TSTypeReference" &&
      reference.typeName.type === "Identifier" &&
      componentTypes.has(reference.typeName.name);
    if (!isComponentType || reference.type !== "TSTypeReference") return Option.none();
    return Option.flatMap(Option.fromNullishOr(reference.typeArguments), (args) =>
      Option.fromNullishOr(args.params[0]),
    );
  });
};

/** The props type of a capitalized function's first parameter, `function X(props: P)`. */
const parameterProps = (fn: ESTree.Node): Option.Option<TypeNode> => {
  if (!isFunction(fn)) return Option.none();
  if (!Option.exists(functionName(fn), isCapitalized)) return Option.none();
  return Option.flatMap(Option.fromNullishOr(fn.params[0]), (parameter) => {
    if (parameter.type !== "Identifier" && parameter.type !== "ObjectPattern") return Option.none();
    return Option.map(Option.fromNullishOr(parameter.typeAnnotation), (a) => a.typeAnnotation);
  });
};

/** Local interfaces and type aliases by name. */
const localTypes = (program: ESTree.Program): ReadonlyMap<string, ESTree.Node> => {
  const types = new Map<string, ESTree.Node>();
  walk(program, (node) => {
    if (node.type === "TSInterfaceDeclaration") types.set(node.id.name, node.body);
    if (node.type === "TSTypeAliasDeclaration") types.set(node.id.name, node.typeAnnotation);
    return !isFunction(node);
  });
  return types;
};

/** The members of a props type, through local names and intersections. */
const membersOf = (
  type: TypeNode,
  types: ReadonlyMap<string, ESTree.Node>,
  seen: ReadonlySet<string> = new Set(),
): ReadonlyArray<ESTree.Node> => {
  if (type.type === "TSTypeLiteral") return type.members;
  if (type.type === "TSInterfaceBody") return type.body;
  if (type.type === "TSIntersectionType") {
    return type.types.flatMap((part) => membersOf(part, types, seen));
  }
  if (type.type === "TSTypeReference" && type.typeName.type === "Identifier") {
    const name = type.typeName.name;
    if (seen.has(name)) return [];
    return Option.match(Option.fromNullishOr(types.get(name)), {
      onNone: () => [],
      onSome: (local) => membersOf(local, types, new Set([...seen, name])),
    });
  }
  return [];
};

/** A function type that returns `void`: a callback by its type, whatever its name (`close: () => void`). */
const returnsVoid = (fn: ESTree.Node): boolean =>
  "returnType" in fn &&
  Option.exists(
    Option.fromNullishOr(fn.returnType),
    (annotation) => annotation.typeAnnotation.type === "TSVoidKeyword",
  );

/** Whether a type is a getter: a function of no arguments, or `Accessor<T>`. */
const isAccessorType = (type: TypeNode): boolean => {
  if (type.type === "TSFunctionType") return type.params.length === 0 && !returnsVoid(type);
  return (
    type.type === "TSTypeReference" &&
    type.typeName.type === "Identifier" &&
    type.typeName.name === "Accessor"
  );
};

/** The name of an accessor member, if `member` is one and is not exempt. */
const accessorMember = (member: ESTree.Node): Option.Option<string> => {
  const named =
    (member.type === "TSPropertySignature" || member.type === "TSMethodSignature") &&
    !member.computed &&
    member.key.type === "Identifier";
  if (!named || (member.type !== "TSPropertySignature" && member.type !== "TSMethodSignature")) {
    return Option.none();
  }
  if (member.key.type !== "Identifier" || exemptName.test(member.key.name)) return Option.none();
  const name = member.key.name;
  if (member.type === "TSMethodSignature") {
    return Option.some(name).pipe(
      Option.filter(() => member.params.length === 0 && !returnsVoid(member)),
    );
  }
  return Option.flatMap(Option.fromNullishOr(member.typeAnnotation), (annotation) =>
    Option.some(name).pipe(Option.filter(() => isAccessorType(annotation.typeAnnotation))),
  );
};

export const noAccessorProp = Rule.define({
  name: "no-accessor-prop",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Type a Solid prop as the value it carries (routes: Route[]), not as an accessor (routes: () => Route[]).",
    docs: { recommended: false, preset: "skills-solid" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const accessorsIn = (program: ESTree.Program) => {
      if (!isSolidProgram(program)) return [];
      const types = localTypes(program);
      const reported = new Set<ESTree.Node>();
      const found: Array<{ readonly node: ESTree.Node; readonly name: string }> = [];
      const check = (props: TypeNode) =>
        membersOf(props, types).forEach((member) =>
          Option.map(accessorMember(member), (name) => {
            if (reported.has(member)) return;
            reported.add(member);
            found.push({ node: member, name });
          }),
        );
      walk(program, (node) => {
        if (node.type === "VariableDeclarator") Option.map(annotatedProps(node), check);
        Option.map(parameterProps(node), check);
        return true;
      });
      return found;
    };
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(
          accessorsIn(program),
          ({ node, name }) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `The prop \`${name}\` is typed as an accessor, so every caller must wrap its value in a function and a plain value no longer type-checks. Solid's props are already live: \`props.${name}\` re-reads on each access. Type it as the value (\`${name}: Route[]\`) and let callers pass \`${name}={routes()}\`.`,
              }),
            ),
          { discard: true },
        ),
    };
  },
});
