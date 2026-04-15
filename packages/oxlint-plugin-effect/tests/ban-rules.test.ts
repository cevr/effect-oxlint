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
  noGlobalFetch,
  noGlobalConsole,
  noGlobalDate,
  noGlobalRandom,
  noGlobalTimers,
  noNewPromise,
  noNewError,
  noProcessEnv,
  noNodeBuiltinImport,
  noDynamicImport,
  noThrowStatement,
  noTryCatch,
  noJsonParse,
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

// --- Global ban rules ---

describe("noGlobalFetch", () => {
  test("reports fetch()", () => {
    const result = Testing.runRule(noGlobalFetch, "CallExpression", Testing.callExpr("fetch"))
    expect(result.length).toBe(1)
  })

  test("ignores other calls", () => {
    const result = Testing.runRule(noGlobalFetch, "CallExpression", Testing.callExpr("getData"))
    Testing.expectNoDiagnostics(result)
  })
})

describe("noGlobalConsole", () => {
  test("reports console.log", () => {
    const result = Testing.runRule(noGlobalConsole, "MemberExpression", Testing.memberExpr("console", "log"))
    expect(result.length).toBe(1)
  })

  test("reports console.error", () => {
    const result = Testing.runRule(noGlobalConsole, "MemberExpression", Testing.memberExpr("console", "error"))
    expect(result.length).toBe(1)
  })

  test("ignores logger.log", () => {
    const result = Testing.runRule(noGlobalConsole, "MemberExpression", Testing.memberExpr("logger", "log"))
    Testing.expectNoDiagnostics(result)
  })
})

describe("noGlobalDate", () => {
  test("reports Date.now", () => {
    const result = Testing.runRule(noGlobalDate, "MemberExpression", Testing.memberExpr("Date", "now"))
    expect(result.length).toBe(1)
  })

  test("reports new Date()", () => {
    const result = Testing.runRule(noGlobalDate, "NewExpression", Testing.newExpr("Date"))
    expect(result.length).toBe(1)
  })
})

describe("noGlobalRandom", () => {
  test("reports Math.random", () => {
    const result = Testing.runRule(noGlobalRandom, "MemberExpression", Testing.memberExpr("Math", "random"))
    expect(result.length).toBe(1)
  })
})

describe("noGlobalTimers", () => {
  test("reports setTimeout", () => {
    const result = Testing.runRule(noGlobalTimers, "CallExpression", Testing.callExpr("setTimeout"))
    expect(result.length).toBe(1)
  })

  test("reports setInterval", () => {
    const result = Testing.runRule(noGlobalTimers, "CallExpression", Testing.callExpr("setInterval"))
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

describe("noProcessEnv", () => {
  test("reports process.env", () => {
    const result = Testing.runRule(noProcessEnv, "MemberExpression", Testing.memberExpr("process", "env"))
    expect(result.length).toBe(1)
  })
})

// --- Import ban rules ---

describe("noNodeBuiltinImport", () => {
  test("reports import from 'fs'", () => {
    const result = Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", Testing.importDecl("fs"))
    expect(result.length).toBe(1)
  })

  test("reports import from 'node:fs'", () => {
    const result = Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", Testing.importDecl("node:fs"))
    expect(result.length).toBe(1)
  })

  test("reports import from 'child_process'", () => {
    const result = Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", Testing.importDecl("child_process"))
    expect(result.length).toBe(1)
  })

  test("ignores import from 'effect'", () => {
    const result = Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", Testing.importDecl("effect"))
    Testing.expectNoDiagnostics(result)
  })
})

// --- Statement ban rules ---

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

describe("noDynamicImport", () => {
  test("reports dynamic import()", () => {
    const result = Testing.runRule(noDynamicImport, "ImportExpression", { type: "ImportExpression" } as never)
    expect(result.length).toBe(1)
  })
})

// --- JSON ---

describe("noJsonParse", () => {
  test("reports JSON.parse", () => {
    const result = Testing.runRule(noJsonParse, "MemberExpression", Testing.memberExpr("JSON", "parse"))
    expect(result.length).toBe(1)
  })

  test("reports JSON.stringify", () => {
    const result = Testing.runRule(noJsonParse, "MemberExpression", Testing.memberExpr("JSON", "stringify"))
    expect(result.length).toBe(1)
  })
})
