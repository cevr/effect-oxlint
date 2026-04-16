import { describe, test, expect } from "bun:test"
import { Testing } from "../src/vendor/effect-oxlint/index.js"
import {
  noUnnecessaryPipe,
  noEffectSucceedVoid,
  noEffectMapVoid,
  noEffectFnGenerator,
  noExtendsNativeError,
  noIifeWrapper,
  noEffectSucceedString,
  noFromNullableCoalesce,
  noInstanceofSchema,
  noNestedPipe,
  noNestedEffectCall,
  noPositionalLogError,
} from "../src/rules/index.js"

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
  test("reports Effect.map(self, Effect.flatMap(...)) — data-first call tower", () => {
    const inner = Testing.callOfMember("Effect", "flatMap", [Testing.id("x"), Testing.id("f")])
    const outer = Testing.callOfMember("Effect", "map", [Testing.id("self"), inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    expect(result.length).toBe(1)
  })

  test("ignores data-last Effect.map(Effect.flatMap(...)) — pipeable inside .pipe()", () => {
    const inner = Testing.callOfMember("Effect", "flatMap", [Testing.id("f")])
    const outer = Testing.callOfMember("Effect", "map", [inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    Testing.expectNoDiagnostics(result)
  })

  test("ignores flat Effect.map(x)", () => {
    const node = Testing.callOfMember("Effect", "map", [Testing.id("x")])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", node)
    Testing.expectNoDiagnostics(result)
  })

  test("ignores Effect.ensuring(Effect.sync(...)) — not a pipeline combinator", () => {
    const inner = Testing.callOfMember("Effect", "sync", [Testing.id("x")])
    const outer = Testing.callOfMember("Effect", "ensuring", [inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    Testing.expectNoDiagnostics(result)
  })

  test("ignores Effect.scoped(Effect.gen(...))", () => {
    const inner = Testing.callOfMember("Effect", "gen", [])
    const outer = Testing.callOfMember("Effect", "scoped", [inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    Testing.expectNoDiagnostics(result)
  })

  test("ignores Effect.runPromise(Effect.gen(...)) — test boundary", () => {
    const inner = Testing.callOfMember("Effect", "gen", [])
    const outer = Testing.callOfMember("Effect", "runPromise", [inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    Testing.expectNoDiagnostics(result)
  })

  test("reports Effect.flatMap(self, Effect.tap(...)) — data-first", () => {
    const inner = Testing.callOfMember("Effect", "tap", [Testing.id("x"), Testing.id("f")])
    const outer = Testing.callOfMember("Effect", "flatMap", [Testing.id("self"), inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    expect(result.length).toBe(1)
  })

  test("ignores pipeable Effect.andThen(Effect.failCause(cause)) — single-arg inside .pipe()", () => {
    const inner = Testing.callOfMember("Effect", "failCause", [Testing.id("cause")])
    const outer = Testing.callOfMember("Effect", "andThen", [inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    Testing.expectNoDiagnostics(result)
  })

  test("reports Effect.andThen(x, Effect.sync(...)) — effect-accepting + producer", () => {
    const inner = Testing.callOfMember("Effect", "sync", [Testing.id("f")])
    const outer = Testing.callOfMember("Effect", "andThen", [Testing.id("x"), inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    expect(result.length).toBe(1)
  })

  test("reports Effect.tap(x, Effect.sync(...))", () => {
    const inner = Testing.callOfMember("Effect", "sync", [Testing.id("f")])
    const outer = Testing.callOfMember("Effect", "tap", [Testing.id("x"), inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
    expect(result.length).toBe(1)
  })

  test("ignores Effect.map(x, Effect.sync(...)) — map takes a fn, producer inner is a type error elsewhere", () => {
    const inner = Testing.callOfMember("Effect", "sync", [Testing.id("f")])
    const outer = Testing.callOfMember("Effect", "map", [Testing.id("x"), inner])
    const result = Testing.runRule(noNestedEffectCall, "CallExpression", outer)
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
