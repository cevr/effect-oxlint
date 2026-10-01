import { describe, expect, test } from "bun:test";

import { noNodeBuiltinImport } from "../src/rules/index.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";
import { lintCases, lintFixtures } from "./support/lint-fixtures.js";

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

describe("module file paths", () => {
  test("rejects host path facts and hand-read module URLs", () => {
    const results = lintCases("noModulePathFacts", {
      valid: [
        'const file = path.fromFileUrl(new URL("./x.ts", import.meta.url));',
        "const url = import.meta.url;",
        "load(import.meta.url);",
        'load(new URL("./x.ts", import.meta.url));',
        'const href = new URL(".", import.meta.url).href;',
        "if (import.meta.main) run();",
        'const host = new URL("https://x").pathname;',
        'const u = new URL("https://x", base); u.pathname;',
        'const name = "file:///x".slice(7);',
        'class URL { constructor(a, b) {} pathname = "" }; new URL(".", import.meta.url).pathname;',
        'const u = new URL(".", import.meta.url); load(u);',
        'const page = new URL("https://example.com/a%20b", import.meta.url).pathname;',
        "const page = new URL(`data:text/plain,x`, import.meta.url).pathname;",
        'const u = new URL("http://x/y", import.meta.url); u.pathname;',
      ],
      invalid: [
        "const dir = import.meta.dirname;",
        "const file = import.meta.filename;",
        "const dir = import.meta.dir;",
        "const file = import.meta.path;",
        'const dir = import.meta["dirname"];',
        'const file = new URL("./x.ts", import.meta.url).pathname;',
        'const dir = new URL(".", import.meta.url).pathname;',
        "const file = new URL(import.meta.url).pathname;",
        'const u = new URL("./x.ts", import.meta.url);\nconst file = u.pathname;',
        "const url = import.meta.url; const file = new URL(url).pathname;",
        'const file = new URL(".", import.meta.url).href.slice(7);',
        'const u = new URL(".", import.meta.url); u.href.substring(7);',
        "const file = import.meta.url.slice(7);",
        "const file = import.meta.url.substring(7);",
        'const file = import.meta.url.replace("file://", "");',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("points to Path.fromFileUrl at the read", () => {
    const findings = lintFixtures("noModulePathFacts", {
      "paths.ts": [
        'const u = new URL("./x.ts", import.meta.url);',
        "const ok = u.href;",
        "const file = u.pathname;",
      ].join("\n"),
    });
    expect(findings.get("paths.ts")).toEqual([
      { line: 3, message: expect.stringContaining("Path.fromFileUrl") },
    ]);
  });
});

describe("locale ordering", () => {
  test("rejects localeCompare on any receiver and Intl.Collator in any spelling", () => {
    const results = lintCases("noLocaleCompare", {
      valid: [
        "names.sort(Order.String);",
        "const label = new Intl.NumberFormat().format(1);",
        "const supported = Intl.Collator.supportedLocalesOf([]);",
        "const Intl = { Collator: class {} }; new Intl.Collator();",
        "const compare = (a, b) => (a < b ? -1 : 1);",
      ],
      invalid: [
        "names.sort((a, b) => a.localeCompare(b));",
        'const order = "a".localeCompare("b");',
        'const order = a.name.localeCompare(b.name, "en");',
        'const order = a["localeCompare"](b);',
        "const compare = String.prototype.localeCompare;",
        "const collator = new Intl.Collator();",
        'const collator = Intl.Collator("en");',
        "const collator = new globalThis.Intl.Collator();",
        'const collator = new globalThis["Intl"].Collator();',
        "const I = Intl; const collator = new I.Collator();",
        "const { Collator } = Intl; const collator = new Collator();",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("names Order.String as the deterministic order", () => {
    const findings = lintFixtures("noLocaleCompare", {
      "sort.ts": "names.sort((a, b) => a.localeCompare(b));",
    });
    expect(findings.get("sort.ts")).toEqual([
      { line: 1, message: expect.stringContaining("Use Order.String") },
    ]);
  });
});

describe("display-width padding", () => {
  test("rejects code-unit padding of text, and allows it on a number rendered as ASCII", () => {
    const results = lintCases("noCodeUnitPadding", {
      valid: [
        "const gutter = String(lineNumber).padStart(4);",
        'const hex = value.toString(16).padStart(2, "0");',
        'const byte = ((value & 0x0f) | 0x40).toString(16).padStart(2, "0");',
        "const price = (cents / 100).toFixed(2).padStart(8);",
        'const minutes = String(Math.floor(secs / 60)).padStart(2, "0");',
        "const width = label.length;",
      ],
      invalid: [
        "const cell = name.padEnd(24);",
        'const cell = `${name}`.padEnd(24, " ");',
        "const cell = row.category.padEnd(16);",
        "const cell = format(preset.worker).padEnd(34);",
        'const cell = name["padStart"](8);',
        "const pad = String.prototype.padEnd;",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("names display width as the measure", () => {
    const findings = lintFixtures("noCodeUnitPadding", {
      "table.ts": "const cell = name.padEnd(24);",
    });
    expect(findings.get("table.ts")).toEqual([
      { line: 1, message: expect.stringContaining("Pad by display width") },
    ]);
  });
});
