/**
 * State that one JSX subtree alone uses lives in a child component for that
 * subtree.
 *
 * Reported: a `useState` pair of a component whose every reference, the
 * value and the setter both, sits inside JSX under one element that is not
 * the outermost JSX element around them (outside handlers, hooks and derived
 * values). Two forms:
 * - one element: every reference is an attribute or child of the same
 *   element, so the pair is passed to that element alone. Always reported
 *   when the element is a component; a lower-case element (`<button>`)
 *   follows the subtree form's limits, since moving its state means
 *   extracting a component.
 * - subtree: the references share an ancestor element but sit in several
 *   elements below it. Reported when the component has at least
 *   `minComponentLines` lines (100) and the shared element spans at most
 *   `maxSharedSpanRatio` (0.5) of them: in a small leaf, or when the subtree
 *   is most of the component, moving the state buys nothing.
 * Test modules are skipped. Source: the react skill, `state.md` "State
 * Colocation: keep state as close to where it's used as possible" (catalog
 * SR-R07).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestorsOf } from "./_anti-slop-effect.js";
import { componentsIn, walkComponent } from "./_react.js";
import type { Component, StatePair } from "./_react.js";
import { isTestModule, skipFile } from "./_test-files.js";

const Options = Schema.UndefinedOr(
  Schema.Struct({
    maxSharedSpanRatio: Schema.optionalKey(Schema.Number),
    minComponentLines: Schema.optionalKey(Schema.Number),
  }),
);

type JsxNode = ESTree.JSXElement | ESTree.JSXFragment;
type Identifier = Extract<ESTree.Node, { type: "Identifier" }>;

const isJsxNode = (node: ESTree.Node): node is JsxNode =>
  node.type === "JSXElement" || node.type === "JSXFragment";

/** A lower-case element such as `<button>`: moving its state needs a new component. */
const isIntrinsic = (element: JsxNode): boolean =>
  element.type === "JSXElement" &&
  element.openingElement.name.type === "JSXIdentifier" &&
  /^[a-z]/u.test(element.openingElement.name.name);

/** Whether an identifier is a reference, not a binding, a member name or a key. */
const isReference = (node: Identifier, pair: StatePair): boolean => {
  const parent = node.parent;
  if (parent === pair.declarator.id || parent?.type === "ArrayPattern") return false;
  if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) {
    return false;
  }
  return !(parent?.type === "Property" && parent.key === node);
};

/** The JSX elements around a node inside the component, outermost first. */
const jsxChain = (node: ESTree.Node, component: Component): ReadonlyArray<JsxNode> => {
  const chain: Array<JsxNode> = [];
  for (const ancestor of ancestorsOf(node)) {
    if (ancestor === component.fn) break;
    if (isJsxNode(ancestor)) chain.push(ancestor);
  }
  return chain.reverse();
};

/** The longest shared prefix of the chains. */
const sharedDepth = (chains: Arr.NonEmptyReadonlyArray<ReadonlyArray<JsxNode>>): number => {
  const first = Arr.headNonEmpty(chains);
  let depth = 0;
  while (
    depth < first.length &&
    chains.every((chain) => chain.length > depth && chain[depth] === first[depth])
  ) {
    depth += 1;
  }
  return depth;
};

interface Placement {
  readonly element: JsxNode;
  readonly oneElement: boolean;
}

/** Where a state pair's references meet, when they all sit in JSX under one inner element. */
const placementOf = (pair: StatePair, component: Component): Option.Option<Placement> => {
  const refs: Array<Identifier> = [];
  walkComponent(component, (node) => {
    if (
      node.type === "Identifier" &&
      (node.name === pair.value || node.name === pair.setter) &&
      isReference(node, pair)
    ) {
      refs.push(node);
    }
    return true;
  });
  const both =
    refs.some((ref) => ref.name === pair.value) && refs.some((ref) => ref.name === pair.setter);
  if (!both) return Option.none();
  const chains = refs.map((ref) => jsxChain(ref, component));
  // A reference outside JSX (a handler, a hook, a derived value) has an empty chain, so the shared depth is 0.
  if (!Arr.isReadonlyArrayNonEmpty(chains)) return Option.none();
  const depth = sharedDepth(chains);
  const first = Arr.headNonEmpty(chains);
  return Option.flatMap(Arr.get(first, depth - 1), (element) => {
    if (depth <= 1) return Option.none();
    return Option.some({
      element,
      oneElement: chains.every((chain) => Option.contains(Arr.last(chain), element)),
    });
  });
};

export const preferColocatedState = Rule.define({
  name: "prefer-colocated-state",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Keep state that one JSX subtree alone uses in a child component for that subtree.",
    docs: { recommended: false, preset: "skills-react" },
    schema: [
      {
        type: "object",
        properties: {
          maxSharedSpanRatio: { type: "number" },
          minComponentLines: { type: "number" },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ maxSharedSpanRatio: 0.5, minComponentLines: 100 }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const maxRatio = options?.maxSharedSpanRatio ?? 0.5;
    const minLines = options?.minComponentLines ?? 100;
    const lines = (node: ESTree.Node): number => ctx.sourceCode.getText(node).split("\n").length;
    const tagOf = (element: JsxNode): string => {
      if (element.type === "JSXFragment") return "<>";
      return `<${ctx.sourceCode.getText(element.openingElement.name)}>`;
    };

    const reported = (placement: Placement, component: Component): boolean => {
      if (placement.oneElement && !isIntrinsic(placement.element)) return true;
      const componentLines = lines(component.fn);
      return componentLines >= minLines && lines(placement.element) <= maxRatio * componentLines;
    };

    const check = (component: Component) =>
      Effect.forEach(
        component.states,
        (pair) =>
          Option.match(
            Option.filter(placementOf(pair, component), (placement) =>
              reported(placement, component),
            ),
            {
              onNone: () => Effect.void,
              onSome: (placement) =>
                ctx.report(
                  Diagnostic.make({
                    node: pair.declarator,
                    message: `\`${pair.value}\` and \`${pair.setter}\` are used only inside ${tagOf(placement.element)}, yet \`${component.name}\` holds them, so every change re-renders all of \`${component.name}\`. Move the \`useState\` into the component that renders that subtree (extract one if it is plain markup), and pass it nothing.`,
                  }),
                ),
            },
          ),
        { discard: true },
      );

    return {
      Program: (node: ESTree.Program) =>
        Effect.forEach(componentsIn(node), check, { discard: true }),
    };
  },
});
