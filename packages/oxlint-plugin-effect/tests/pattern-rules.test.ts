import { describe, test, expect } from "bun:test"
import { Testing } from "../src/vendor/effect-oxlint/index.js"
import {
  noReturnNull,
  noUnnecessaryPipe,
  noEffectSucceedVoid,
  noEffectMapVoid,
  noEffectFnGenerator,
  noExtendsNativeError,
  noAsyncFunction,
  noIifeWrapper,
  noEffectSucceedString,
  noFromNullableCoalesce,
  noInstanceofSchema,
  noNestedPipe,
  noNestedEffectCall,
  noPositionalLogError,
} from "../src/rules/index.js"

describe("noReturnNull", () => {
  test("reports return null", () => {
    const node = {
      type: "ReturnStatement",
      argument: { type: "Literal", value: null },
    } as never
    const result = Testing.runRule(noReturnNull, "ReturnStatement", node)
    expect(result.length).toBe(1)
  })

  test("ignores return 42", () => {
    const node = {
      type: "ReturnStatement",
      argument: { type: "Literal", value: 42 },
    } as never
    const result = Testing.runRule(noReturnNull, "ReturnStatement", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noUnnecessaryPipe", () => {
  test("reports pipe(x) with single arg", () => {
    const node = Testing.callExpr("pipe", [Testing.id("myEffect")])
    const result = Testing.runRule(noUnnecessaryPipe, "CallExpression", node)
    expect(result.length).toBe(1)
  })

  test("ignores pipe(x, f)", () => {
    const node = Testing.callExpr("pipe", [Testing.id("myEffect"), Testing.id("mapFn")])
    const result = Testing.runRule(noUnnecessaryPipe, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noEffectSucceedVoid", () => {
  test("reports Effect.succeed(undefined)", () => {
    const node = Testing.callOfMember("Effect", "succeed", [Testing.id("undefined")])
    const result = Testing.runRule(noEffectSucceedVoid, "CallExpression", node)
    expect(result.length).toBe(1)
  })

  test("ignores Effect.succeed(42)", () => {
    const node = Testing.callOfMember("Effect", "succeed", [Testing.numLiteral(42)])
    const result = Testing.runRule(noEffectSucceedVoid, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noEffectMapVoid", () => {
  test("reports Effect.map(() => undefined)", () => {
    const fn = Testing.arrowFn(Testing.id("undefined"))
    const node = Testing.callOfMember("Effect", "map", [fn])
    const result = Testing.runRule(noEffectMapVoid, "CallExpression", node)
    expect(result.length).toBe(1)
  })

  test("reports Effect.map(() => {})", () => {
    const fn = Testing.arrowFn(Testing.blockStmt([]))
    const node = Testing.callOfMember("Effect", "map", [fn])
    const result = Testing.runRule(noEffectMapVoid, "CallExpression", node)
    expect(result.length).toBe(1)
  })
})

describe("noEffectFnGenerator", () => {
  test("reports Effect.fn(function*() {})", () => {
    const gen = {
      type: "FunctionExpression",
      generator: true,
      params: [],
      body: Testing.blockStmt([]),
    }
    const node = Testing.callOfMember("Effect", "fn", [gen])
    const result = Testing.runRule(noEffectFnGenerator, "CallExpression", node)
    expect(result.length).toBe(1)
  })

  test("ignores Effect.fn('name')", () => {
    const node = Testing.callOfMember("Effect", "fn", [Testing.strLiteral("myFn")])
    const result = Testing.runRule(noEffectFnGenerator, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noExtendsNativeError", () => {
  test("reports class extends Error", () => {
    const node = {
      type: "ClassDeclaration",
      superClass: Testing.id("Error"),
      id: Testing.id("MyError"),
      body: { type: "ClassBody", body: [] },
    } as never
    const result = Testing.runRule(noExtendsNativeError, "ClassDeclaration", node)
    expect(result.length).toBe(1)
  })

  test("ignores class extends Schema.TaggedErrorClass", () => {
    const node = {
      type: "ClassDeclaration",
      superClass: Testing.memberExpr("Schema", "TaggedErrorClass"),
      id: Testing.id("MyError"),
      body: { type: "ClassBody", body: [] },
    } as never
    const result = Testing.runRule(noExtendsNativeError, "ClassDeclaration", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noAsyncFunction", () => {
  test("reports async function", () => {
    const node = {
      type: "FunctionDeclaration",
      async: true,
      id: Testing.id("fetchData"),
      params: [],
      body: Testing.blockStmt([]),
    } as never
    const result = Testing.runRule(noAsyncFunction, "FunctionDeclaration", node)
    expect(result.length).toBe(1)
  })

  test("ignores non-async function", () => {
    const node = {
      type: "FunctionDeclaration",
      async: false,
      id: Testing.id("fetchData"),
      params: [],
      body: Testing.blockStmt([]),
    } as never
    const result = Testing.runRule(noAsyncFunction, "FunctionDeclaration", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noIifeWrapper", () => {
  test("reports (() => expr)()", () => {
    const node = {
      type: "CallExpression",
      callee: Testing.arrowFn(Testing.id("x")),
      arguments: [],
    } as never
    const result = Testing.runRule(noIifeWrapper, "CallExpression", node)
    expect(result.length).toBe(1)
  })

  test("ignores normal calls", () => {
    const result = Testing.runRule(noIifeWrapper, "CallExpression", Testing.callExpr("myFn"))
    Testing.expectNoDiagnostics(result)
  })
})

describe("noEffectSucceedString", () => {
  test("reports Effect.succeed('done')", () => {
    const node = Testing.callOfMember("Effect", "succeed", [Testing.strLiteral("done")])
    const result = Testing.runRule(noEffectSucceedString, "CallExpression", node)
    expect(result.length).toBe(1)
  })

  test("ignores Effect.succeed(42)", () => {
    const node = Testing.callOfMember("Effect", "succeed", [Testing.numLiteral(42)])
    const result = Testing.runRule(noEffectSucceedString, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noFromNullableCoalesce", () => {
  test("reports Option.fromNullable(x ?? null)", () => {
    const coalesce = {
      type: "LogicalExpression",
      operator: "??",
      left: Testing.id("x"),
      right: { type: "Literal", value: null },
    }
    const node = Testing.callOfMember("Option", "fromNullable", [coalesce])
    const result = Testing.runRule(noFromNullableCoalesce, "CallExpression", node)
    expect(result.length).toBe(1)
  })

  test("ignores Option.fromNullable(x)", () => {
    const node = Testing.callOfMember("Option", "fromNullable", [Testing.id("x")])
    const result = Testing.runRule(noFromNullableCoalesce, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noInstanceofSchema", () => {
  test("reports instanceof check", () => {
    const node = {
      type: "BinaryExpression",
      operator: "instanceof",
      left: Testing.id("x"),
      right: Testing.id("MySchema"),
    } as never
    const result = Testing.runRule(noInstanceofSchema, "BinaryExpression", node)
    expect(result.length).toBe(1)
  })

  test("ignores === check", () => {
    const node = {
      type: "BinaryExpression",
      operator: "===",
      left: Testing.id("x"),
      right: Testing.id("y"),
    } as never
    const result = Testing.runRule(noInstanceofSchema, "BinaryExpression", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noNestedPipe", () => {
  test("reports pipe(pipe(x, f), g)", () => {
    const innerPipe = Testing.callExpr("pipe", [Testing.id("x"), Testing.id("f")])
    const outerPipe = Testing.callExpr("pipe", [innerPipe, Testing.id("g")])
    const result = Testing.runRule(noNestedPipe, "CallExpression", outerPipe)
    expect(result.length).toBe(1)
  })

  test("ignores flat pipe(x, f, g)", () => {
    const node = Testing.callExpr("pipe", [Testing.id("x"), Testing.id("f"), Testing.id("g")])
    const result = Testing.runRule(noNestedPipe, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noNestedEffectCall", () => {
  test("reports Effect.map(Effect.flatMap(...))", () => {
    const inner = Testing.callOfMember("Effect", "flatMap", [Testing.id("x")])
    const outer = Testing.callOfMember("Effect", "map", [inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    expect(result.length).toBe(1)
  })

  test("ignores flat Effect.map(x)", () => {
    const node = Testing.callOfMember("Effect", "map", [Testing.id("x")])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })
})

describe("noPositionalLogError", () => {
  test("reports Effect.logWarning with two args", () => {
    const node = Testing.callOfMember("Effect", "logWarning", [
      Testing.strLiteral("something failed"),
      Testing.id("error"),
    ])
    const result = Testing.runRule(noPositionalLogError, "CallExpression", node)
    expect(result.length).toBe(1)
  })

  test("reports Effect.logError with two args", () => {
    const node = Testing.callOfMember("Effect", "logError", [
      Testing.strLiteral("fatal"),
      Testing.id("err"),
    ])
    const result = Testing.runRule(noPositionalLogError, "CallExpression", node)
    expect(result.length).toBe(1)
  })

  test("ignores Effect.log with single arg", () => {
    const node = Testing.callOfMember("Effect", "log", [
      Testing.strLiteral("hello"),
    ])
    const result = Testing.runRule(noPositionalLogError, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })

  test("allows Cause as second arg", () => {
    const causeArg = Testing.callOfMember("Cause", "fail", [Testing.id("error")])
    const node = Testing.callOfMember("Effect", "logWarning", [
      Testing.strLiteral("something failed"),
      causeArg,
    ])
    const result = Testing.runRule(noPositionalLogError, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })
})
