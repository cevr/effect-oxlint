import { describe, expect, test } from "bun:test";

import { noNodeBuiltinImport } from "../src/rules/index.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";
import { lintCases } from "./support/lint-fixtures.js";

describe("ambient platform APIs", () => {
  test("rejects general JavaScript globals with Effect replacements", () => {
    const results = lintCases("noGlobals", {
      valid: [],
      invalid: [
        "console.log(1);",
        "Date.now();",
        "Math.random();",
        "crypto.randomUUID();",
        'JSON.parse("1");',
        "process.env;",
        'Bun.file("x");',
        'Deno.readFile("x");',
        'localStorage.getItem("x");',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("rejects direct calls and constructors with Effect replacements", () => {
    const results = lintCases("noGlobals", {
      valid: [],
      invalid: [
        'atob("x");',
        'btoa("x");',
        'fetch("/x");',
        "queueMicrotask(run);",
        "setTimeout(run, 1);",
        "new Date();",
        'new WebSocket("ws://x");',
        'new Worker("x");',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("allows isTTY capability reads on process streams but keeps every other use banned", () => {
    const results = lintCases("noGlobals", {
      valid: ["process.stderr.isTTY;", "process.stdin.isTTY;", "process.stdout.isTTY;"],
      invalid: ['process.stderr.write("x");', "process.stdout;"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("rejects Web Crypto digest but leaves unmatched crypto operations alone", () => {
    const results = lintCases("noGlobals", {
      valid: ["crypto.sign(key, bytes);", "Bun.password;"],
      invalid: ['crypto.subtle.digest("SHA-256", bytes);'],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("Node builtins", () => {
  test("rejects modules wholly replaced by Effect", () => {
    for (const source of [
      "node:child_process",
      "node:fs/promises",
      "node:http",
      "node:path",
      "node:stream",
      "node:timers/promises",
      "node:worker_threads",
    ]) {
      expect(
        Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", Testing.importDecl(source)),
      ).toHaveLength(1);
    }
  });

  test("allows modules without a complete Effect replacement", () => {
    for (const source of ["node:dns", "node:os", "node:zlib", "node:module", "node:vm"]) {
      expect(
        Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", Testing.importDecl(source)),
      ).toHaveLength(0);
    }
  });

  test("checks only replaced operations from partial crypto and process modules", () => {
    const cryptoRandom = Testing.importDeclWithSpecifiers("node:crypto", [
      Testing.importSpecifier("randomUUID"),
    ]);
    const cryptoHmac = Testing.importDeclWithSpecifiers("node:crypto", [
      Testing.importSpecifier("createHmac"),
    ]);
    const processEnv = Testing.importDeclWithSpecifiers("node:process", [
      Testing.importSpecifier("env"),
    ]);
    const processPlatform = Testing.importDeclWithSpecifiers("node:process", [
      Testing.importSpecifier("platform"),
    ]);

    expect(Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", cryptoRandom)).toHaveLength(1);
    expect(Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", cryptoHmac)).toHaveLength(0);
    expect(Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", processEnv)).toHaveLength(1);
    expect(Testing.runRule(noNodeBuiltinImport, "ImportDeclaration", processPlatform)).toHaveLength(
      0,
    );
  });

  test("tracks namespace access without banning unmatched operations", () => {
    const cryptoImport = Testing.importDeclWithSpecifiers("node:crypto", [
      Testing.importNamespaceSpecifier("nodeCrypto"),
    ]);
    const randomBytes = Testing.memberExpr("nodeCrypto", "randomBytes");
    const createHmac = Testing.memberExpr("nodeCrypto", "createHmac");

    expect(
      Testing.runRuleMulti(noNodeBuiltinImport, [
        ["ImportDeclaration", cryptoImport],
        ["MemberExpression", randomBytes],
      ]),
    ).toHaveLength(1);
    expect(
      Testing.runRuleMulti(noNodeBuiltinImport, [
        ["ImportDeclaration", cryptoImport],
        ["MemberExpression", createHmac],
      ]),
    ).toHaveLength(0);
  });
});
