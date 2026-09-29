import { describe, expect, test } from "bun:test";

import { lintCases } from "./support/lint-fixtures.js";

describe("noWidenThenAssert evidence", () => {
  test("recognizes each broad widening form", () => {
    const results = lintCases("noWidenThenAssert", {
      valid: [
        "const value: Record<string, unknown, never> = { a: 1 }; const typed = value as { a: number };",
        "const wide: Record<string, unknown> = { a: 1 }; const typed = wide as Record<string, unknown>;",
      ],
      invalid: [
        "const value: { [key: string]: unknown } = { a: 1 }; const typed = value as { a: number };",
        "const wide: Record<string, unknown> = { a: 1 }; const typed = wide as Record<string, number>;",
        "const wide: Record<string, unknown> = { a: 1 }; const typed = wide as Readonly<Record<string, number>>;",
        "const wide = { a: 1 } as unknown; const typed = wide as { a: number };",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("follows evidence through annotations, assertions, and const aliases", () => {
    const results = lintCases("noWidenThenAssert", {
      valid: [
        "const known: unknown = input; const wide: object = known; const typed = wide as Foo;",
        "const a = b; const b = a; const wide: unknown = a; const typed = wide as number;",
      ],
      invalid: [
        "const known: { a: number } = input; const wide: unknown = known; const typed = wide as { a: number };",
        "const wide: unknown = input as Foo; const typed = wide as Foo;",
        "const known = input as Foo; const wide: object = known; const typed = wide as Foo;",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("stays within one function and after the widening declaration", () => {
    const results = lintCases("noWidenThenAssert", {
      valid: [
        "const wide: unknown = 1; function read() { return wide as number; }",
        "const known = { a: 1 }; function read() { const wide: unknown = known; return wide as { a: number }; }",
        "function read() { const early = wide as number; const wide: unknown = 1; return early; }",
      ],
      invalid: ["function read() { const wide: unknown = 1; return wide as number; }"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});
