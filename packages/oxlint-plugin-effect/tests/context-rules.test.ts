import { describe, test, expect } from "bun:test"
import { Testing } from "../src/vendor/effect-oxlint/index.js"
import {
  noPlatformGlobals,
  noThrowInEffectGen,
  noTryCatchInEffectGen,
  noConsoleInEffect,
  noFetchInEffect,
  noDateInEffect,
  noRandomInEffect,
  noTimersInEffect,
  noJsonInEffect,
  noProcessEnvInEffect,
} from "../src/rules/index.js"

// Helper: simulate entering and exiting Effect.gen context
const effectGenNode = Testing.callOfMember("Effect", "gen", [])

/**
 * For context-aware rules, we need to:
 * 1. Enter Effect.gen (CallExpression event)
 * 2. Fire the target event (ThrowStatement, MemberExpression, etc.)
 * 3. Exit Effect.gen (CallExpression:exit event)
 *
 * Using runRuleMulti to simulate the sequence.
 */

describe("noThrowInEffectGen", () => {
  test("reports throw inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noThrowInEffectGen, [
      ["CallExpression", effectGenNode],
      ["ThrowStatement", Testing.throwStmt()],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores throw outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noThrowInEffectGen, [
      ["ThrowStatement", Testing.throwStmt()],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noTryCatchInEffectGen", () => {
  test("reports try/catch inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noTryCatchInEffectGen, [
      ["CallExpression", effectGenNode],
      ["TryStatement", Testing.tryStmt()],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores try/catch outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noTryCatchInEffectGen, [
      ["TryStatement", Testing.tryStmt()],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noConsoleInEffect", () => {
  test("reports console.log inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noConsoleInEffect, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("console", "log")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores console.log outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noConsoleInEffect, [
      ["MemberExpression", Testing.memberExpr("console", "log")],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noFetchInEffect", () => {
  test("reports fetch() inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noFetchInEffect, [
      ["CallExpression", effectGenNode],
      ["CallExpression", Testing.callExpr("fetch")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores fetch() outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noFetchInEffect, [
      ["CallExpression", Testing.callExpr("fetch")],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noDateInEffect", () => {
  test("reports Date.now inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noDateInEffect, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Date", "now")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports new Date() inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noDateInEffect, [
      ["CallExpression", effectGenNode],
      ["NewExpression", Testing.newExpr("Date")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores Date.now outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noDateInEffect, [
      ["MemberExpression", Testing.memberExpr("Date", "now")],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noRandomInEffect", () => {
  test("reports Math.random inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noRandomInEffect, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Math", "random")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores Math.random outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noRandomInEffect, [
      ["MemberExpression", Testing.memberExpr("Math", "random")],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noTimersInEffect", () => {
  test("reports setTimeout inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noTimersInEffect, [
      ["CallExpression", effectGenNode],
      ["CallExpression", Testing.callExpr("setTimeout")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores setTimeout outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noTimersInEffect, [
      ["CallExpression", Testing.callExpr("setTimeout")],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noJsonInEffect", () => {
  test("reports JSON.parse inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noJsonInEffect, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("JSON", "parse")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores JSON.parse outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noJsonInEffect, [
      ["MemberExpression", Testing.memberExpr("JSON", "parse")],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noProcessEnvInEffect", () => {
  test("reports process.env inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noProcessEnvInEffect, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("process", "env")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores process.env outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noProcessEnvInEffect, [
      ["MemberExpression", Testing.memberExpr("process", "env")],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noPlatformGlobals", () => {
  test("reports Bun.file with FileSystem hint", () => {
    const result = Testing.runRuleMulti(noPlatformGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Bun", "file")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectDiagnostics(result, [{
      message: "Avoid Bun.file inside Effect context. Use FileSystem from 'effect'.",
    }])
  })

  test("reports Bun.serve with HttpServer hint", () => {
    const result = Testing.runRuleMulti(noPlatformGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Bun", "serve")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectDiagnostics(result, [{
      message: "Avoid Bun.serve inside Effect context. Use HttpServer from 'effect/unstable/http'.",
    }])
  })

  test("reports process.exit with Effect.fail hint", () => {
    const result = Testing.runRuleMulti(noPlatformGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("process", "exit")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectDiagnostics(result, [{
      message: "Avoid process.exit inside Effect context. Use Effect.fail or Effect.die.",
    }])
  })

  test("reports process.cwd with Path hint", () => {
    const result = Testing.runRuleMulti(noPlatformGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("process", "cwd")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectDiagnostics(result, [{
      message: "Avoid process.cwd inside Effect context. Use Path from 'effect'.",
    }])
  })

  test("reports Deno.readFile with FileSystem hint", () => {
    const result = Testing.runRuleMulti(noPlatformGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Deno", "readFile")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectDiagnostics(result, [{
      message: "Avoid Deno.readFile inside Effect context. Use FileSystem from 'effect'.",
    }])
  })

  test("reports unknown property with generic hint", () => {
    const result = Testing.runRuleMulti(noPlatformGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Bun", "someNewApi")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectDiagnostics(result, [{
      message: "Avoid Bun.someNewApi inside Effect context. Wrap in a service for testability.",
    }])
  })

  test("ignores Bun.file outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noPlatformGlobals, [
      ["MemberExpression", Testing.memberExpr("Bun", "file")],
    ])
    Testing.expectNoDiagnostics(result)
  })

  test("ignores non-platform globals inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noPlatformGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Effect", "succeed")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectNoDiagnostics(result)
  })
})
