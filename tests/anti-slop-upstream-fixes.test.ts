import { describe, expect, test } from "bun:test";

import { noConditionalEmptyObjectSpread } from "../src/rules/index.js";
import { lintCases, lintFixtures } from "./support/lint-fixtures.js";

const expectCases = (rule: string, cases: Parameters<typeof lintCases>[1]) => {
  const results = lintCases(rule, cases);
  expect(results.reportedValid).toEqual([]);
  expect(results.missedInvalid).toEqual([]);
};

const prelude = "type Command = { readonly run: () => void }; declare const startCommand: Command;";

describe("anti-slop fixes synced from upstream", () => {
  test("noConditionalEmptyObjectSpread reports without a semantics-changing autofix", () => {
    expect(noConditionalEmptyObjectSpread.meta?.fixable).toBeUndefined();
    expectCases("noConditionalEmptyObjectSpread", {
      valid: ["declare const value: string; export const result = { value };"],
      invalid: [
        "declare const value: string | undefined; export const result = { ...(value !== undefined ? { value } : {}) };",
      ],
    });
  });

  test("noKnownValueWidening allows empty accumulators and literal-keyed records", () => {
    expectCases("noKnownValueWidening", {
      valid: [
        `${prelude} export class Registry { commands: Record<string, Command> = {}; }`,
        `${prelude} export function create(): Record<string, Command> { return {}; }`,
        `${prelude} export const labels: Record<"a" | "b", number> = { a: 1, b: 2 };`,
        `${prelude} type Diet = "vegan" | "omnivore"; export const labels: Record<Diet, string> = { vegan: "V", omnivore: "O" };`,
      ],
      invalid: [
        `${prelude} type Key = string; export const commands: Record<Key, Command> = { start: startCommand };`,
        `${prelude} type Open = Record<string, Command>; const source = { start: startCommand }; export const commands: Open = source;`,
        `${prelude} export function outer() { type Open = Record<string, Command>; const commands: Open = { start: startCommand }; return commands; }`,
      ],
    });
  });

  test("noObjectParameters resolves aliases by lexical scope and names destructured parameters", () => {
    expectCases("noObjectParameters", {
      valid: [
        "type Alias = object; export function consume<Alias>(value: Alias) { return value; }",
        "type Payload = object; export function outer() { type Payload = { readonly id: string }; return (value: Payload) => value; }",
      ],
      invalid: [
        "export function outer() { type Payload = object; return (value: Payload) => value; }",
        "type Identity<T> = T; export function consume(value: Identity<object>) { return value; }",
      ],
    });
    const findings = lintFixtures("noObjectParameters", {
      "destructured.ts": "export function consume({ value }: object = {}) { return value; }\n",
    });
    expect(findings.get("destructured.ts")?.[0]?.message).toContain("`{ value }`");
  });

  test("noUnknownTypeAliases sees unknown through unions, generics, and nested scopes", () => {
    expectCases("noUnknownTypeAliases", {
      valid: [
        "export type Payload = string | number;",
        "type Box<T> = { readonly value: T }; export type Payload = Box<unknown>;",
      ],
      invalid: [
        "export type Payload = string | unknown;",
        "type Identity<T> = T; export type Payload = Identity<unknown>;",
        "export function outer() { type Payload = unknown; return 1; }",
      ],
    });
  });

  test("noUnsafeDictionaryType ignores type parameter constraints and survives substitution cycles", () => {
    expectCases("noUnsafeDictionaryType", {
      valid: [
        "export function run<T extends Record<string, unknown>>(input: T): T { return input; }",
        "type Wrap<T> = { readonly wrapped: T }; type Inner<T, U> = { readonly value: T } & Wrap<U>; type Outer<T, U> = Record<string, Inner<T, U>>; export declare function f<T, U>(): Outer<T, U>;",
      ],
      invalid: [
        "export type A = Record<string, unknown>;",
        "export function outer() { type Identity<T> = T; type A = Record<string, Identity<unknown>>; return 1; }",
      ],
    });
  });

  test("noUnknownParameters exempts type guards and rejection handlers, and sees unknown unions", () => {
    expectCases("noUnknownParameters", {
      valid: [
        "export function isString(value: unknown): value is string { return value === 'x'; }",
        "declare const pending: Promise<number>; export const handled = pending.catch((error: unknown) => error);",
        "declare const pending: Promise<number>; export const handled = pending.then((value) => value, (reason: unknown) => reason);",
      ],
      invalid: [
        "export function parse(value: string | unknown): void { void value; }",
        "export function isString(value: unknown, context: unknown): value is string { return value === context; }",
        "declare const pending: Promise<number>; export const handled = pending.then((value: unknown) => value);",
      ],
    });
  });

  test("noRuntimeTypeof allows existence probes for possibly absent bindings", () => {
    expectCases("noRuntimeTypeof", {
      valid: [
        'export const isServer = typeof document === "undefined";',
        'export const hasStorage = "undefined" !== typeof localStorage;',
      ],
      invalid: [
        'declare const input: string | number; export const text = typeof input === "string";',
      ],
    });
  });

  test("noShapeInSymbolNames allows members owned by another value", () => {
    expectCases("noShapeInSymbolNames", {
      valid: [
        "import type { ExternalSchema } from './schema.js'; declare const schema: ExternalSchema; export const field = schema.shape.id;",
      ],
      invalid: ["export const shape = 1;"],
    });
  });
});
