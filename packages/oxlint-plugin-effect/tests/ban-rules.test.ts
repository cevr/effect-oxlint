import { describe, test, expect } from "bun:test"
import { Testing } from "../src/vendor/effect-oxlint/index.js"
import {
  noEffectDo,
  noEffectNever,
  noEffectAs,
  noEffectAsync,
  noEffectBind,
  noOptionAs,
  noRuntimeRunFork,
  noRunInEffect,
} from "../src/rules/index.js"

// --- API ban rules ---

describe("noEffectDo", () => {
  test("reports Effect.Do", () => {
    const result = Testing.runRule(noEffectDo, "MemberExpression", Testing.memberExpr("Effect", "Do"))
    Testing.expectDiagnostics(result, [{ message: "Avoid Effect.Do builder notation. Use flat pipe-based flow or Effect.gen." }])
  })

  test("ignores Effect.map", () => {
    const result = Testing.runRule(noEffectDo, "MemberExpression", Testing.memberExpr("Effect", "map"))
    Testing.expectNoDiagnostics(result)
  })
})

describe("noEffectNever", () => {
  test("reports Effect.never", () => {
    const result = Testing.runRule(noEffectNever, "MemberExpression", Testing.memberExpr("Effect", "never"))
    Testing.expectDiagnostics(result, [{ message: "Avoid Effect.never. Use Stream or explicit acquire/release lifecycles." }])
  })
})

describe("noEffectAs", () => {
  test("reports Effect.as", () => {
    const result = Testing.runRule(noEffectAs, "MemberExpression", Testing.memberExpr("Effect", "as"))
    Testing.expectDiagnostics(result, [{ message: "Avoid Effect.as. Use Effect.map for value mapping or Effect.asVoid." }])
  })
})

describe("noEffectAsync", () => {
  test("reports Effect.async", () => {
    const result = Testing.runRule(noEffectAsync, "MemberExpression", Testing.memberExpr("Effect", "async"))
    expect(result.length).toBe(1)
  })
})

describe("noEffectBind", () => {
  test("reports Effect.bind", () => {
    const result = Testing.runRule(noEffectBind, "MemberExpression", Testing.memberExpr("Effect", "bind"))
    expect(result.length).toBe(1)
  })
})

describe("noOptionAs", () => {
  test("reports Option.as", () => {
    const result = Testing.runRule(noOptionAs, "MemberExpression", Testing.memberExpr("Option", "as"))
    expect(result.length).toBe(1)
  })
})

describe("noRuntimeRunFork", () => {
  test("reports Runtime.runFork", () => {
    const result = Testing.runRule(noRuntimeRunFork, "MemberExpression", Testing.memberExpr("Runtime", "runFork"))
    expect(result.length).toBe(1)
  })
})

describe("noRunInEffect", () => {
  test("reports Effect.runSync", () => {
    const result = Testing.runRule(noRunInEffect, "MemberExpression", Testing.memberExpr("Effect", "runSync"))
    expect(result.length).toBe(1)
  })

  test("reports Effect.runPromise", () => {
    const result = Testing.runRule(noRunInEffect, "MemberExpression", Testing.memberExpr("Effect", "runPromise"))
    expect(result.length).toBe(1)
  })

  test("ignores Effect.gen", () => {
    const result = Testing.runRule(noRunInEffect, "MemberExpression", Testing.memberExpr("Effect", "gen"))
    Testing.expectNoDiagnostics(result)
  })
})
