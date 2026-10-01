import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures, reportedLines } from "./support/lint-fixtures.js";

describe("array method rules in parsed source", () => {
  test("noArrayFilterMap skips a const declared without an initializer", () => {
    const findings = lintFixtures("noArrayFilterMap", {
      "declared.ts": [
        "declare const items; items.filter(Boolean).map(String);",
        "const known = [1, 2]; known.filter(Boolean).map(String);",
      ].join("\n"),
    });
    expect(reportedLines(findings, "declared.ts")).toEqual([2]);
  });

  test("noReduceAccumulatorCopy stops at a nested function declaration", () => {
    const results = lintCases("noReduceAccumulatorCopy", {
      valid: [
        "items.reduce((acc, item) => { function copy() { return Object.assign({}, acc); } return copy(); }, {});",
      ],
      invalid: ["items.reduce((acc, item) => Object.assign({}, acc, item), {});"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("noDynamicImports boundaries", () => {
  test("accepts named lazy-loading boundaries", () => {
    const results = lintCases("noDynamicImports", {
      valid: [
        'const [first] = await import("./module.js");',
        'function loadModule() { return import("./module.js"); }',
        'const loadModule = () => import("./module.js");',
      ],
      invalid: [
        'const [,] = await import("./module.js");',
        'export default function () { return import("./module.js"); }',
        'Other.promise(() => import("./module.js"));',
        'module.require("./module.js");',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("reports createRequire and calls through its alias", () => {
    const findings = lintFixtures("noDynamicImports", {
      "alias.ts": [
        'import { createRequire } from "node:module";',
        "const load = createRequire(import.meta.url);",
        'load("./module.js");',
      ].join("\n"),
    });
    expect(reportedLines(findings, "alias.ts")).toEqual([2, 3]);
  });

  test("reports a createRequire bridge called inline", () => {
    const findings = lintFixtures("noDynamicImports", {
      "inline.ts": [
        'import { createRequire as bridge } from "module";',
        'const fs = bridge(import.meta.url)("node:fs");',
        'const other = (() => createRequire)()("node:fs");',
      ].join("\n"),
    });
    expect(reportedLines(findings, "inline.ts")).toEqual([2]);
  });

  test("reports every import() when named boundaries are not allowed", () => {
    const findings = lintFixtures(
      "noDynamicImports",
      {
        "strict.ts": [
          'const loaded = await import("./module.js");',
          'const loadModule = () => import("./module.js");',
          'function loadOther() { return import("./module.js"); }',
          'const effect = Effect.promise(() => import("./module.js"));',
          "// oxlint-disable-next-line effect/noDynamicImports -- the compiled binary embeds this worker",
          'const worker = await import("./worker.js");',
          'import("./module.js");',
        ].join("\n"),
      },
      { options: [{ allowNamedBoundaries: false }] },
    );
    expect(reportedLines(findings, "strict.ts")).toEqual([1, 2, 3, 4, 7]);
  });
});

describe("platform capability rules", () => {
  test("noGlobals ignores a shadowed banned call", () => {
    const results = lintCases("noGlobals", {
      valid: ["const fetch = () => 1; fetch();"],
      invalid: ["fetch();"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("noGlobals reads a global through the global object, a computed name, an alias and a destructure", () => {
    const results = lintCases("noGlobals", {
      valid: [
        "value instanceof Date;",
        "Date.UTC(2020, 1);",
        "Math.max(1, 2);",
        "const { max } = Math; max(1, 2);",
        "typeof process;",
        "process.stdout.isTTY;",
        "globalThis.process.stdout.isTTY;",
        "globalThis.structuredClone(value);",
        "const self = { fetch: () => 1 }; self.fetch();",
        "const globalThis = { process: { env: {} } }; globalThis.process.env;",
        "const p = { env: {} }; p.env;",
        "process[key];",
        "let when: Date = value;",
        "interface Client { fetch(): void; console: Console }",
        "value.Date.now();",
        "const options = { console: 1, process: 2 };",
        'import { fetch } from "./http.js"; fetch();',
        "function run(process: Runner) { process.exit(1); }",
      ],
      invalid: [
        'globalThis.fetch("/x");',
        "self.setTimeout(run, 1);",
        "window.console.log(1);",
        "global.process.exit(1);",
        "new globalThis.Date();",
        "globalThis.Date.now();",
        "globalThis.Math.random();",
        "globalThis.process.env;",
        "(process as NodeJS.Process).env;",
        'globalThis["process"].env;',
        "globalThis?.process.env;",
        'process["env"];',
        "process[`env`];",
        'console["log"](1);',
        'crypto["randomUUID"]();',
        "globalThis.crypto.randomUUID();",
        'globalThis.crypto.subtle.digest("SHA-256", bytes);',
        "const { env } = process;",
        'const { "log": log } = console;',
        "const p = process; p.env;",
        "const p = globalThis.process; p.env;",
        "const g = globalThis; g.process.env;",
        "const { process: p } = globalThis; p.env;",
        "const D = Date; new D();",
        'const f = fetch; f("/x");',
        'const f = globalThis.fetch; f("/x");',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("noGlobals follows an alias only while it holds the global, and walks nested destructures", () => {
    const results = lintCases("noGlobals", {
      valid: [
        "let p = process; p = { env: {} }; p.env;",
        "var g = globalThis; g = { process: { env: {} } }; g.process.env;",
        "const { process: { platform } } = globalThis;",
        "const { process: { platform } = fallback } = globalThis;",
        "var p = process; var p = { env: {} }; p.env;",
      ],
      invalid: [
        "var g = globalThis; var g = g; g.process.env;",
        "var g = globalThis; var h = g; var g = h; h.process.env;",
        "const { process: { env } } = globalThis; use(env);",
        "const { process: { env } = fallback } = globalThis;",
        'const { crypto: { subtle } } = globalThis; subtle.digest("SHA-256", bytes);',
        "const { process: { env: { HOME } } } = globalThis;",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("noGlobals reports a wholly banned global read as a value", () => {
    const findings = lintFixtures(
      "noGlobals",
      {
        "host.ts": [
          "const { spawn } = Bun;",
          'const B = Bun; B.file("x");',
          "use(Bun);",
          "const { cwd } = process;",
          "const p = process; p.kill(1);",
          'process["cwd"]();',
          "const { Bun: Runtime } = globalThis; Runtime.version;",
          "self.Bun.version;",
          "use(globalThis.Bun);",
          "const { ...rest } = Bun;",
          "typeof Bun;",
          "type Runtime = typeof Bun;",
          "process.stdout.isTTY;",
          "{ const Bun = { version: 1 }; use(Bun); }",
          "use(process);",
        ].join("\n"),
      },
      {
        options: [
          {
            members: {
              Bun: { use: "an Effect platform service" },
              process: { properties: ["cwd", "kill"], use: "a platform service" },
            },
          },
        ],
      },
    );
    expect(reportedLines(findings, "host.ts")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("noModuleMocks ignores local test-API lookalikes and reports mock functions", () => {
    const results = lintCases("noModuleMocks", {
      valid: ['const vi = { mock: () => 1 }; vi.mock("./module.js");'],
      invalid: ['vi.mock("./module.js");', "vi.fn();"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("noNodeBuiltinImport follows partial crypto and process aliases", () => {
    const results = lintCases("noNodeBuiltinImport", {
      valid: [
        'import process from "node:process"; process.cwd();',
        'import crypto from "node:crypto"; crypto.createHash("sha256");',
      ],
      invalid: [
        'import { "randomUUID" as uuid } from "node:crypto";',
        'import * as nodeCrypto from "node:crypto"; nodeCrypto.webcrypto.getRandomValues(bytes);',
        'import crypto from "node:crypto"; crypto.subtle.digest("SHA-256", bytes);',
        'import process from "node:process"; process.env;',
        'import { subtle } from "node:crypto"; subtle.digest("SHA-256", bytes);',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("noGlobals bans the members a project configures", () => {
    const findings = lintFixtures(
      "noGlobals",
      {
        "host.ts": [
          "const version = Bun.version;",
          "const executable = process.execPath;",
          "const pid = process.pid;",
          "const title = process.title;",
          "{ const Bun = { version: 1 }; Bun.version; }",
          "const env = process.env;",
        ].join("\n"),
      },
      {
        options: [
          {
            members: {
              Bun: { use: "an Effect platform service" },
              process: { properties: ["execPath", "pid"], use: "a platform service" },
            },
          },
        ],
      },
    );
    expect(reportedLines(findings, "host.ts")).toEqual([1, 2, 3, 6]);
  });

  test("noNodeBuiltinImport bans the modules and members a project configures", () => {
    const findings = lintFixtures(
      "noNodeBuiltinImport",
      {
        "host.ts": [
          'import { $ } from "bun";',
          'import { Database } from "bun:sqlite";',
          'import { createHash } from "node:crypto";',
          'import { hostname, EOL } from "node:os";',
          'import * as os from "os"; os.homedir(); os.EOL;',
          'import { fileURLToPath } from "url";',
          'import { join } from "node:path";',
          'import { lookup } from "dns";',
        ].join("\n"),
      },
      {
        options: [
          {
            modules: {
              bun: { use: "an Effect platform service" },
              "bun:*": { use: "an Effect platform service" },
              crypto: { use: "Crypto" },
              os: { members: ["hostname", "homedir"], use: "a platform service" },
              "node:url": { use: "Path.fromFileUrl" },
            },
          },
        ],
      },
    );
    expect(reportedLines(findings, "host.ts")).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("platform layer provisions", () => {
  test("report a layer read through every binding shape, and leave other members alone", () => {
    const results = lintCases("noPlatformLayerOutsideEntry", {
      valid: [
        'import { BunRuntime } from "@effect/platform-bun"; BunRuntime.runMain(program);',
        'import { BunSocket } from "@effect/platform-bun"; const socket = BunSocket.makeNet(options);',
        'import * as Platform from "@effect/platform-bun"; Platform.BunRuntime.runMain(program);',
        'import { makeNet } from "@effect/platform-bun/BunSocket"; makeNet(options);',
        'import type { BunFileSystem } from "@effect/platform-bun"; type Fs = typeof BunFileSystem;',
        'import { BunFileSystem } from "@effect/platform-bun"; type Layer = typeof BunFileSystem.layer;',
        "const BunWidget = { layer: 1 }; BunWidget.layer;",
      ],
      invalid: [
        'import { BunFileSystem } from "@effect/platform-bun"; BunFileSystem.layer;',
        'import { BunFileSystem as Fs } from "@effect/platform-bun"; Fs?.layerNoop;',
        'import * as Platform from "@effect/platform-bun"; Platform.BunPath.layer;',
        'import * as Platform from "@effect/platform-bun"; const { BunPath } = Platform; BunPath.layer;',
        'import { layer } from "@effect/platform-bun/BunCrypto";',
        'import * as BunPath from "@effect/platform-bun/BunPath"; BunPath.layer;',
        'import { BunCrypto } from "@effect/platform-bun"; const Crypto = BunCrypto; Crypto.layer;',
        'import { BunCrypto } from "@effect/platform-bun"; const { layer } = BunCrypto;',
        'import { NodePath } from "@effect/platform-node"; NodePath.layer;',
        'const PlatformBun = await import("@effect/platform-bun"); PlatformBun.BunPath.layer;',
        '(await import("@effect/platform-bun/BunPath")).layer;',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("report a platform module handed on, and a re-export of a platform package", () => {
    const results = lintCases("noPlatformLayerOutsideEntry", {
      valid: [
        'import { BunFileSystem } from "@effect/platform-bun"; export type Fs = typeof BunFileSystem;',
        'export type { BunFileSystem } from "@effect/platform-bun";',
      ],
      invalid: [
        'import { BunFileSystem } from "@effect/platform-bun"; pick(BunFileSystem);',
        'import { BunFileSystem } from "@effect/platform-bun"; [BunFileSystem][0].layer;',
        'import { BunFileSystem } from "@effect/platform-bun"; BunFileSystem[key];',
        'import { BunFileSystem } from "@effect/platform-bun"; export { BunFileSystem };',
        'import { BunFileSystem } from "@effect/platform-bun"; const { ...rest } = BunFileSystem;',
        'export * from "@effect/platform-bun";',
        'export { BunPath } from "@effect/platform-bun";',
        'export * as BunCrypto from "@effect/platform-bun/BunCrypto";',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("report a platform module exported through a declarator", () => {
    const results = lintCases("noPlatformLayerOutsideEntry", {
      valid: [
        'import { BunSocket } from "@effect/platform-bun"; export const socket = BunSocket.makeNet;',
        'import { BunRuntime } from "@effect/platform-bun"; export const { runMain } = BunRuntime;',
        'import { BunFileSystem } from "@effect/platform-bun"; const Fs = BunFileSystem; export type F = typeof Fs;',
      ],
      invalid: [
        'import { BunFileSystem } from "@effect/platform-bun"; export const Fs = BunFileSystem;',
        'import { BunFileSystem } from "@effect/platform-bun"; export let Fs = BunFileSystem;',
        'import * as Platform from "@effect/platform-bun"; export const Fs = Platform.BunFileSystem;',
        'import * as Platform from "@effect/platform-bun"; export const { BunPath } = Platform;',
        'import * as Platform from "@effect/platform-bun"; export const P = Platform;',
        'import { BunFileSystem } from "@effect/platform-bun"; const Fs = BunFileSystem; export const Again = Fs;',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("read computed members by their literal name", () => {
    const findings = lintFixtures("noPlatformLayerOutsideEntry", {
      "computed.ts": [
        'import { BunFileSystem } from "@effect/platform-bun";',
        'BunFileSystem["layer"];',
        'BunFileSystem["make"];',
      ].join("\n"),
    });
    expect(reportedLines(findings, "computed.ts")).toEqual([2]);
  });

  test("report a project's own layers, and skip test modules", () => {
    const findings = lintFixtures(
      "noPlatformLayerOutsideEntry",
      {
        "app.ts": [
          'import { HostPlatformLive } from "./host.js";',
          'import * as Host from "./host.js";',
          "Host.HostPlatformLive;",
          'import { HostService } from "./host.js";',
        ].join("\n"),
        "app.test.ts": 'import { BunFileSystem } from "@effect/platform-bun"; BunFileSystem.layer;',
      },
      { options: [{ layers: ["HostPlatformLive"] }] },
    );
    expect(reportedLines(findings, "app.ts")).toEqual([1, 3]);
    expect(reportedLines(findings, "app.test.ts")).toEqual([]);
  });

  test("read only the packages the packages option names", () => {
    const findings = lintFixtures(
      "noPlatformLayerOutsideEntry",
      {
        "app.ts": [
          'import { BunPath } from "@effect/platform-bun";',
          "BunPath.layer;",
          'import { DenoPath } from "@example/platform-deno";',
          "DenoPath.layer;",
        ].join("\n"),
      },
      { options: [{ packages: ["@example/platform-deno"] }] },
    );
    expect(reportedLines(findings, "app.ts")).toEqual([4]);
  });
});

describe("syntax rules", () => {
  test("noChainedTypeAssertions allows a single assertion", () => {
    const results = lintCases("noChainedTypeAssertions", {
      valid: ["const text = value as string;"],
      invalid: ["const text = (value as unknown) as string;"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("requireSuppressionReason reads an empty reason and names a lint example", () => {
    const findings = lintFixtures("requireSuppressionReason", {
      "empty-reason.ts": "// oxlint-disable-next-line no-console --\nexport const value = 1;",
      "blanket.ts": "// oxlint-disable-next-line -- blanket\nexport const value = 1;",
    });
    expect(reportedLines(findings, "empty-reason.ts")).toEqual([1]);
    expect(findings.get("blanket.ts")).toEqual([
      { line: 1, message: expect.stringContaining("oxlint-disable-next-line rule-name -- reason") },
    ]);
  });
});
