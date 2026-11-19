/**
 * A test that replaces a native capability (the clock, randomness, the
 * network state, storage) changes behaviour for everything else that runs in
 * the process, and it tests the code against a patch instead of the contract
 * it depends on. In Effect each capability is a service whose test layer is
 * the replacement: TestClock, a Random layer, a Connectivity or Clipboard
 * service, KeyValueStore's memory layer. LANDMINES LM-NATIVE, after
 * landmines' `testing/no-test-doubles`.
 *
 * Reported in test modules, with the service to use:
 * - a write to `Date.now`, `performance.now`, `Math.random`,
 *   `crypto.randomUUID`, `crypto.getRandomValues`, any member of `navigator`,
 *   `localStorage` or `sessionStorage`, or one of those objects itself
 *   (also through `globalThis`, `window`, `self` or `global`), by assignment,
 *   `Object.defineProperty` or `Reflect.set`;
 * - a member saved, replaced and restored in one function
 *   (`const saved = api.load; api.load = …; …; api.load = saved`): the
 *   replacing write, whatever the object, since its fix is a layer for the
 *   port it patches.
 * A restore in `finally` or `afterEach` is no exemption: the hazard is the
 * replaced behaviour, not the leak. An event handler (`onmessage`,
 * `onerror`: `on` and lower-case letters) is left alone.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestorsOf, contains, isFunction } from "./_anti-slop-effect.js";
import { isTestModule, skipFile } from "./_test-files.js";

const globalRoots: ReadonlySet<string> = new Set(["globalThis", "window", "self", "global"]);
const eventHandler = /^on[a-z]+$/u;

/** The service whose test layer replaces a native capability, by its path. */
const serviceFor = (path: ReadonlyArray<string>): Option.Option<string> => {
  const [root = "", member = ""] = path;
  if ((root === "Date" || root === "performance") && member === "now")
    return Option.some("the Clock service, and TestClock in tests");
  if (root === "Math" && member === "random")
    return Option.some("the Random service, and a seeded Random layer in tests");
  if (root === "crypto" && (member === "randomUUID" || member === "getRandomValues"))
    return Option.some("the Random service (or an id service), and a seeded layer in tests");
  if (root === "navigator")
    return Option.some(
      "a service for the capability (Connectivity, Clipboard, Geolocation) with a test layer",
    );
  if (root === "localStorage" || root === "sessionStorage")
    return Option.some("KeyValueStore, and its memory layer in tests");
  return Option.none();
};

/** The names a member chain reads: `globalThis.Date.now` → [globalThis, Date, now]. */
const pathOf = (node: ESTree.Node): Option.Option<ReadonlyArray<string>> => {
  if (node.type === "Identifier") return Option.some([node.name]);
  if (node.type !== "MemberExpression") return Option.none();
  return Option.flatMap(keyOf(node), (key) =>
    Option.map(pathOf(node.object), (path) => [...path, key]),
  );
};

/** The key a member expression reads: `now` in `Date.now` or `Date["now"]`. */
const keyOf = (node: ESTree.MemberExpression): Option.Option<string> => {
  const property = node.property;
  if (!node.computed && property.type === "Identifier") return Option.some(property.name);
  if (property.type === "Literal" && Predicate.isString(property.value))
    return Option.some(property.value);
  return Option.none();
};

/** A path without its global root: `window.navigator.onLine` → [navigator, onLine]. */
const unrooted = (path: ReadonlyArray<string>): ReadonlyArray<string> => {
  const [root = "", ...rest] = path;
  if (globalRoots.has(root) && rest.length > 0) return rest;
  return path;
};

/** The service a write to `path` should have used, unless it is an event handler. */
const nativeWrite = (path: ReadonlyArray<string>): Option.Option<string> => {
  const native = unrooted(path);
  if (eventHandler.test(native.at(-1) ?? "")) return Option.none();
  return serviceFor(native);
};

/** The path a `defineProperty`/`Reflect.set` call writes: its target and its key. */
const definedPath = (call: ESTree.CallExpression): Option.Option<ReadonlyArray<string>> => {
  const callee = Option.getOrElse(pathOf(call.callee), () => []).join(".");
  if (callee !== "Object.defineProperty" && callee !== "Reflect.set") return Option.none();
  const [target, key] = call.arguments;
  if (key?.type !== "Literal" || !Predicate.isString(key.value)) return Option.none();
  const name = key.value;
  return Option.flatMap(Option.fromUndefinedOr(target), (written) =>
    Option.map(pathOf(written), (path) => [...path, name]),
  );
};

const same = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((name, index) => name === b[index]);

/** The function (or program) a node runs in. */
const scopeOf = (node: ESTree.Node): ESTree.Node => {
  let last = node;
  for (const ancestor of ancestorsOf(node)) {
    if (isFunction(ancestor)) return ancestor;
    last = ancestor;
  }
  return last;
};

/**
 * Whether the write `assignment` replaces a member its scope saved and later
 * restores: `const saved = x.m` and `x.m = saved` in the same function.
 */
const isSavedAndRestored = (
  assignment: ESTree.AssignmentExpression,
  path: ReadonlyArray<string>,
) => {
  const scope = scopeOf(assignment);
  const saved = new Set<string>();
  const declares = (node: ESTree.Node): boolean => {
    if (node.type !== "VariableDeclarator" || node.id.type !== "Identifier") return false;
    const name = node.id.name;
    const read = Option.flatMap(Option.fromNullOr(node.init), pathOf);
    if (Option.exists(read, (init) => same(init, path))) saved.add(name);
    return false;
  };
  contains(scope, declares);
  if (saved.size === 0) return false;
  return contains(
    scope,
    (node) =>
      node !== assignment &&
      node.type === "AssignmentExpression" &&
      node.right.type === "Identifier" &&
      saved.has(node.right.name) &&
      Option.exists(pathOf(node.left), (written) => same(written, path)),
  );
};

const message = (what: string, service: string): string =>
  `${what} replaces a native capability for every test in the process, and tests the code against a patch instead of its dependency. Depend on ${service}.`;

export const noNativeCapabilityPatch = Rule.define({
  name: "no-native-capability-patch",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Ban patching native capabilities (Date.now, Math.random, crypto, navigator, storage) and save-replace-restore of a member in tests: provide the service's test layer.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    const report = (node: ESTree.Node, text: string) =>
      ctx.report(Diagnostic.make({ node, message: text }));
    return {
      AssignmentExpression: (node: ESTree.AssignmentExpression) => {
        const written = pathOf(node.left);
        if (Option.isNone(written) || written.value.length < 2) return Effect.void;
        const path = written.value;
        const native = nativeWrite(path);
        if (Option.isSome(native))
          return report(node, message(`Writing \`${path.join(".")}\``, native.value));
        if (node.right.type === "Identifier" || !isSavedAndRestored(node, path)) return Effect.void;
        return report(
          node,
          `\`${path.join(".")}\` is saved, replaced and restored, so the test runs against a patch of its dependency, and any other test running meanwhile sees it. Make the dependency a service and provide a test layer for the port.`,
        );
      },
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(
          Option.flatMap(definedPath(node), (path) =>
            Option.map(nativeWrite(path), (service) => [path, service] as const),
          ),
          {
            onNone: () => Effect.void,
            onSome: ([path, service]) =>
              report(node, message(`Redefining \`${path.join(".")}\``, service)),
          },
        ),
    };
  },
});
