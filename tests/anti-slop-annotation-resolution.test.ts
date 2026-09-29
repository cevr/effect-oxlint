import { describe, expect, test } from "bun:test";

import { lintCases } from "./support/lint-fixtures.js";

describe("parameter annotations behind wrapped bindings", () => {
  test("read annotations on rest and defaulted parameters", () => {
    const results = lintCases("noUnknownParameters", {
      valid: ["function wrap(...cause: unknown) {}", "function wrap(cause: unknown = 1) {}"],
      invalid: ["function wrap(...value: unknown) {}", "function wrap(value: unknown = 1) {}"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});
