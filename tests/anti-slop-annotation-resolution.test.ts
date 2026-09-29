import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures } from "./support/lint-fixtures.js";

describe("parameter annotations behind wrapped bindings", () => {
  test("read annotations on rest and defaulted parameters", () => {
    const results = lintCases("noUnknownParameters", {
      valid: ["function wrap(...cause: unknown) {}", "function wrap(cause: unknown = 1) {}"],
      invalid: ["function wrap(...value: unknown) {}", "function wrap(value: unknown = 1) {}"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

const findingsFor = (rule: string, source: string) =>
  lintFixtures(rule, { "case.ts": source }).get("case.ts") ?? [];

describe("type alias resolution by lexical scope", () => {
  test("resolve aliases only where their binding is the single nearest one", () => {
    const results = lintCases("noUnsafeDictionaryType", {
      valid: [
        "export function outer() { type Loose = unknown; return 1; } export type A = Record<string, Loose>;",
        "type Loose = unknown; export function outer() { class Loose {} type A = Record<string, Loose>; return 1; }",
        "type Loop = Loop; export type A = Record<string, Loop>;",
      ],
      invalid: [
        "export interface Empty {} export type A = Record<string, Empty>;",
        "type Dict<T = unknown> = Record<string, T>; export type A = Dict;",
        "type Dict<T> = Record<string, T>; export type A = Dict<unknown>;",
        "type Swap<A, B> = Record<string, A>; type Outer<A, B> = Swap<B, A>; export type P = Outer<string, unknown>;",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("substitute defaulted type parameters, including defaults naming earlier ones", () => {
    const results = lintCases("noUnknownTypeAliases", {
      valid: ["type Loop = Loop; export type Payload = Loop;"],
      invalid: [
        "type Box<T = unknown> = T; export type Payload = Box;",
        "type Pair<A, B = A> = B; export type Payload = Pair<unknown>;",
        "type Loop = Loop | unknown; export type Payload = Loop;",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("unsafe dictionary value classification", () => {
  test("classify direct, wrapped, literal, and mapped dictionary values", () => {
    const results = lintCases("noUnsafeDictionaryType", {
      valid: [
        "interface Base { id: string } interface Empty extends Base {} export type A = Record<string, Empty>;",
        "export type A = Record<string, unknown & string>;",
        "export function run<T extends { a: Record<string, unknown> }>(input: T): T { return input; }",
      ],
      invalid: [
        "export type A = Record<string, string | unknown>;",
        "export type A = Record<string, { a?: never }>;",
        "interface Empty {} export type A = Record<string, Empty>;",
        "export type A = Record<string, Readonly<unknown>>;",
        "export type A = { [key: string]: unknown };",
        "export type A = { [K in string]: unknown };",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("name the unsafe value and report only the outermost unsafe type", () => {
    expect(
      findingsFor("noUnsafeDictionaryType", "export type A = Record<string, unknown & any>;\n")[0]
        ?.message,
    ).toContain("unsafe any");
    expect(
      findingsFor(
        "noUnsafeDictionaryType",
        "export type A = Record<string, Record<string, unknown> | unknown>;\n",
      ),
    ).toHaveLength(1);
    expect(
      findingsFor("noUnsafeDictionaryType", "export type A = { [key: string]: unknown };\n"),
    ).toHaveLength(1);
    const lines = (source: string) =>
      findingsFor("noUnsafeDictionaryType", source).map((finding) => finding.line);
    expect(lines('export type A = Pick<\nRecord<string, unknown>, "a">;\n')).toEqual([1]);
    expect(lines("type Dict = Record<string, unknown>;\nexport type Other = Dict;\n")).toEqual([
      1, 2,
    ]);
  });
});

describe("known value widening targets", () => {
  test("classify annotated targets through wrappers, aliases, and records", () => {
    const results = lintCases("noKnownValueWidening", {
      valid: [
        "type Loose<T> = unknown; export const value: Loose<number> = { a: 1 };",
        "type Key<T> = string; export const value: Record<Key<number>, number> = { a: 1 };",
        'type Keys = { [K in "a" | "b"]: number }; export const value: Keys = { a: 1, b: 2 };',
        'type Labels = Record<"a" | "b", number>; export const value: Labels = { a: 1, b: 2 };',
        "let source = { a: 1 }; source = { a: 2 }; export const value: Record<string, number> = source;",
      ],
      invalid: [
        "export const point: { x: number } = { x: 1 };",
        "const a = b; const b = a; export const value: Record<string, number> = a; export const other: Record<string, number> = { x: 1 };",
        "type Loose = unknown; export const value: Loose = { a: 1 };",
        "export const value: Record = { a: 1 };",
        "export const value: Readonly<Record<string, number>> = { a: 1 };",
        "export function make(): Record<string, number> { return { a: 1 }; }",
        "let value: Record<string, number>; value = { a: 1 };",
        "const source = { a: 1 }; export function read() { const value: Record<string, number> = source; return value; }",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("name the target kind and owning function, reporting chained assertions once", () => {
    const [generic] = findingsFor(
      "noKnownValueWidening",
      "type Box<T> = Record<string, T>; export const value: Box<number> = { a: 1 };\n",
    );
    expect(generic?.message).toContain("generic container");
    const [open] = findingsFor(
      "noKnownValueWidening",
      "type Open = Record<string, number>; export const value: Open = { a: 1 };\n",
    );
    expect(open?.message).toContain("open dictionary");
    const [named] = findingsFor(
      "noKnownValueWidening",
      "export function make(): Record<string, number> { return { a: 1 }; }\n",
    );
    expect(named?.message).toContain("`make`");
    const [anonymous] = findingsFor(
      "noKnownValueWidening",
      "export default function (): Record<string, number> { return { a: 1 }; }\n",
    );
    expect(anonymous?.message).toContain("anonymous function");
    expect(
      findingsFor(
        "noKnownValueWidening",
        "export const value = { a: 1 } as unknown as Record<string, number>;\n",
      ),
    ).toHaveLength(1);
  });
});
