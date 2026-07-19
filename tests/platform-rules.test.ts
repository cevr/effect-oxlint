import { describe, expect, test } from "bun:test";

import { noGlobals, noNodeBuiltinImport } from "../src/rules/index.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";

describe("ambient platform APIs", () => {
  test("rejects general JavaScript globals with Effect replacements", () => {
    for (const [object, property] of [
      ["console", "log"],
      ["Date", "now"],
      ["Math", "random"],
      ["crypto", "randomUUID"],
      ["JSON", "parse"],
      ["process", "env"],
      ["Bun", "file"],
      ["Deno", "readFile"],
      ["localStorage", "getItem"],
    ] as const) {
      expect(
        Testing.runRule(noGlobals, "MemberExpression", Testing.memberExpr(object, property)),
      ).toHaveLength(1);
    }
  });

  test("rejects direct calls and constructors with Effect replacements", () => {
    for (const name of ["atob", "btoa", "fetch", "queueMicrotask", "setTimeout"]) {
      expect(Testing.runRule(noGlobals, "CallExpression", Testing.callExpr(name))).toHaveLength(1);
    }
    for (const name of ["Date", "WebSocket", "Worker"]) {
      expect(Testing.runRule(noGlobals, "NewExpression", Testing.newExpr(name))).toHaveLength(1);
    }
  });

  test("rejects Web Crypto digest but leaves unmatched crypto operations alone", () => {
    const digest = {
      type: "MemberExpression",
      object: Testing.memberExpr("crypto", "subtle"),
      property: Testing.id("digest"),
      computed: false,
    } as never;
    expect(Testing.runRule(noGlobals, "MemberExpression", digest)).toHaveLength(1);
    expect(
      Testing.runRule(noGlobals, "MemberExpression", Testing.memberExpr("crypto", "sign")),
    ).toHaveLength(0);
    expect(
      Testing.runRule(noGlobals, "MemberExpression", Testing.memberExpr("Bun", "password")),
    ).toHaveLength(0);
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
