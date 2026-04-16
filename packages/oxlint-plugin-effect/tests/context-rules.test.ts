import { describe, test, expect } from "bun:test"
import { Testing } from "../src/vendor/effect-oxlint/index.js"
import {
  noGlobals,
  noThrowStatement,
  noTryCatch,
  noNewPromise,
  noNewError,
  noReturnNullish,
  noRunInEffectGen,
} from "../src/rules/index.js"

// Helper: simulate entering and exiting Effect.gen context
const effectGenNode = Testing.callOfMember("Effect", "gen", [])

// --- Global Effect-enforcing rules (fire everywhere) ---

describe("noThrowStatement", () => {
  test("reports throw", () => {
    const result = Testing.runRule(noThrowStatement, "ThrowStatement", Testing.throwStmt())
    expect(result.length).toBe(1)
  })
})

describe("noTryCatch", () => {
  test("reports try/catch", () => {
    const result = Testing.runRule(noTryCatch, "TryStatement", Testing.tryStmt())
    expect(result.length).toBe(1)
  })
})

describe("noNewPromise", () => {
  test("reports new Promise()", () => {
    const result = Testing.runRule(noNewPromise, "NewExpression", Testing.newExpr("Promise"))
    expect(result.length).toBe(1)
  })
})

describe("noNewError", () => {
  test("reports new Error()", () => {
    const result = Testing.runRule(noNewError, "NewExpression", Testing.newExpr("Error"))
    expect(result.length).toBe(1)
  })

  test("reports new TypeError()", () => {
    const result = Testing.runRule(noNewError, "NewExpression", Testing.newExpr("TypeError"))
    expect(result.length).toBe(1)
  })

  test("ignores new MyError()", () => {
    const result = Testing.runRule(noNewError, "NewExpression", Testing.newExpr("MyError"))
    Testing.expectNoDiagnostics(result)
  })
})

describe("noReturnNullish", () => {
  test("reports return null", () => {
    const node = {
      type: "ReturnStatement",
      argument: { type: "Literal", value: null },
    } as never
    const result = Testing.runRule(noReturnNullish, "ReturnStatement", node)
    expect(result.length).toBe(1)
  })

  test("reports return undefined", () => {
    const node = {
      type: "ReturnStatement",
      argument: { type: "Identifier", name: "undefined" },
    } as never
    const result = Testing.runRule(noReturnNullish, "ReturnStatement", node)
    expect(result.length).toBe(1)
  })
})

// --- Effect-context rules (inside Effect.gen/fn only) ---

describe("noGlobals", () => {
  test("reports console.log inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("console", "log")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports fetch() inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["CallExpression", Testing.callExpr("fetch")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports Date.now inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Date", "now")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports new Date() inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["NewExpression", Testing.newExpr("Date")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports Math.random inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Math", "random")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports setTimeout inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["CallExpression", Testing.callExpr("setTimeout")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports JSON.parse inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("JSON", "parse")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports process.env inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("process", "env")],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports process.exit with hint", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("process", "exit")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectDiagnostics(result, [{
      message: "Avoid process.exit inside Effect context. Use Effect.fail or Effect.die.",
    }])
  })

  test("reports Bun.file with FileSystem hint", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Bun", "file")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectDiagnostics(result, [{
      message: "Avoid Bun.file inside Effect context. Use FileSystem from 'effect'.",
    }])
  })

  test("reports Deno.readFile with FileSystem hint", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Deno", "readFile")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectDiagnostics(result, [{
      message: "Avoid Deno.readFile inside Effect context. Use FileSystem from 'effect'.",
    }])
  })

  test("ignores console.log outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["MemberExpression", Testing.memberExpr("console", "log")],
    ])
    Testing.expectNoDiagnostics(result)
  })

  test("ignores Effect.succeed inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noGlobals, [
      ["CallExpression", effectGenNode],
      ["MemberExpression", Testing.memberExpr("Effect", "succeed")],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectNoDiagnostics(result)
  })
})

describe("noRunInEffectGen", () => {
  test("reports Effect.runPromise inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noRunInEffectGen, [
      ["CallExpression", effectGenNode],
      ["CallExpression", Testing.callOfMember("Effect", "runPromise", [Testing.id("x")])],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports Effect.runFork inside Effect.fn", () => {
    const effectFnNode = Testing.callOfMember("Effect", "fn", [])
    const result = Testing.runRuleMulti(noRunInEffectGen, [
      ["CallExpression", effectFnNode],
      ["CallExpression", Testing.callOfMember("Effect", "runFork", [Testing.id("x")])],
      ["CallExpression:exit", effectFnNode],
    ])
    expect(result.length).toBe(1)
  })

  test("reports Runtime.runFork inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noRunInEffectGen, [
      ["CallExpression", effectGenNode],
      ["CallExpression", Testing.callOfMember("Runtime", "runFork", [Testing.id("x")])],
      ["CallExpression:exit", effectGenNode],
    ])
    expect(result.length).toBe(1)
  })

  test("ignores Effect.runForkWith inside Effect.gen (legit v4 callback boundary)", () => {
    const result = Testing.runRuleMulti(noRunInEffectGen, [
      ["CallExpression", effectGenNode],
      ["CallExpression", Testing.callOfMember("Effect", "runForkWith", [Testing.id("services")])],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectNoDiagnostics(result)
  })

  test("ignores managedRuntime.runFork on identifier callee", () => {
    const result = Testing.runRuleMulti(noRunInEffectGen, [
      ["CallExpression", effectGenNode],
      ["CallExpression", Testing.callOfMember("managedRuntime", "runFork", [Testing.id("x")])],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectNoDiagnostics(result)
  })

  test("ignores Effect.runPromise outside Effect.gen", () => {
    const result = Testing.runRuleMulti(noRunInEffectGen, [
      ["CallExpression", Testing.callOfMember("Effect", "runPromise", [Testing.id("x")])],
    ])
    Testing.expectNoDiagnostics(result)
  })

  test("ignores yield* child effect inside Effect.gen", () => {
    const result = Testing.runRuleMulti(noRunInEffectGen, [
      ["CallExpression", effectGenNode],
      ["CallExpression", Testing.callOfMember("Effect", "succeed", [Testing.id("x")])],
      ["CallExpression:exit", effectGenNode],
    ])
    Testing.expectNoDiagnostics(result)
  })
})
