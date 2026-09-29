/**
 * Reading call arguments and options objects. Missing and spread arguments
 * read as none, so no rule indexes `arguments` and checks for a hole.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

const isExpression = (argument: ESTree.Argument): argument is ESTree.Expression =>
  argument.type !== "SpreadElement";

/** The call's argument at `index`, or none when it is missing or spread. */
export const expressionArgument = (
  node: ESTree.CallExpression,
  index: number,
): Option.Option<ESTree.Expression> => Option.filter(Arr.get(node.arguments, index), isExpression);

const isStaticProperty = (
  property: ESTree.ObjectPropertyKind,
  name: string,
): property is ESTree.ObjectProperty =>
  property.type === "Property" &&
  !property.computed &&
  ((property.key.type === "Identifier" && property.key.name === name) ||
    (property.key.type === "Literal" && property.key.value === name));

/** Every non-computed property of an object literal named `name`, in source order. */
export const staticProperties = (
  node: ESTree.ObjectExpression,
  name: string,
): ReadonlyArray<ESTree.ObjectProperty> =>
  node.properties.filter((property) => isStaticProperty(property, name));
