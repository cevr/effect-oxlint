/**
 * Reading call arguments and options objects. Missing and spread arguments
 * read as none, so no rule indexes `arguments` and checks for a hole.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

const isExpression = (argument: ESTree.Argument): argument is ESTree.Expression =>
  argument.type !== "SpreadElement";

/** The call's argument at `index`, or none when it is missing or spread. */
export const expressionArgument = (
  node: ESTree.CallExpression,
  index: number,
): Option.Option<ESTree.Expression> => Option.filter(Arr.get(node.arguments, index), isExpression);

/** The key a property spells statically: `name`, `"name"`, `["name"]`, `` [`name`] ``. */
const staticKey = (property: ESTree.ObjectProperty): Option.Option<string> => {
  const key = property.key;
  if (key.type === "Identifier" && !property.computed) return Option.some(key.name);
  if (key.type === "Literal") return Option.liftPredicate(key.value, Predicate.isString);
  if (key.type === "TemplateLiteral" && key.expressions.length === 0) {
    return Option.fromNullishOr(key.quasis[0]?.value.cooked);
  }
  return Option.none();
};

const isStaticProperty = (
  property: ESTree.ObjectPropertyKind,
  name: string,
): property is ESTree.ObjectProperty =>
  property.type === "Property" && Option.exists(staticKey(property), (key) => key === name);

/**
 * Every property of an object literal whose key spells `name` statically, in
 * source order: a plain key, a string key, or a computed string or
 * substitution-free template key. A computed expression key (`[k]`) is not one.
 */
export const staticProperties = (
  node: ESTree.ObjectExpression,
  name: string,
): ReadonlyArray<ESTree.ObjectProperty> =>
  node.properties.filter((property) => isStaticProperty(property, name));
