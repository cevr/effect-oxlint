import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures, reportedLines } from "./support/lint-fixtures.js";

describe("noModuleMocks", () => {
  test("reports every Vitest and Jest mocking entry point", () => {
    const results = lintCases("noModuleMocks", {
      valid: [
        'import { vi } from "vitest"; vi.useFakeTimers();',
        'import { jest } from "@jest/globals"; jest.useRealTimers();',
        "const jest = { fn: () => 1 }; jest.fn();",
        'import { vi } from "./local-helpers.js"; vi.mock("./module.js");',
      ],
      invalid: [
        'import { vi } from "vitest"; vi.fn();',
        'import { vi } from "vitest"; vi.doMock("./module.js");',
        'import { vi } from "vitest"; vi.mocked(service);',
        'import { vi } from "vitest"; vi.unmock("./module.js");',
        'import { vi as v } from "vitest"; v.spyOn(service, "run");',
        'import { jest } from "@jest/globals"; jest.fn();',
        'jest.doMock("./module.js");',
        'vi.unmock("./module.js");',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("reports bun:test mocks, spies, and runner objects through any alias", () => {
    const results = lintCases("noModuleMocks", {
      valid: [
        'import { test } from "bun:test"; test("works", () => {});',
        'const spyOn = (target, method) => target[method]; spyOn(service, "run");',
        "const mock = { module: () => 1 }; mock.module();",
        'import { mock } from "bun:test"; mock.restore();',
        'import { mock } from "./fakes.js"; mock.module("./module.js");',
      ],
      invalid: [
        'import { mock } from "bun:test"; mock.module("./module.js", () => ({}));',
        'import { mock as m } from "bun:test"; m.module("x");',
        'import { mock } from "bun:test"; const run = mock(() => 1);',
        'import { spyOn } from "bun:test"; spyOn(service, "run");',
        'import { spyOn as watch } from "bun:test"; watch(service, "run");',
        'import { vi } from "bun:test"; vi.mock("./module.js");',
        'import { vi } from "bun:test"; vi.fn();',
        'import { vi } from "bun:test"; vi.mocked(service);',
        'import { jest } from "bun:test"; jest.spyOn(service, "run");',
        'import { jest } from "bun:test"; jest.doMock("./module.js");',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("names the canonical call for an aliased binding", () => {
    const findings = lintFixtures("noModuleMocks", {
      "alias.test.ts": 'import { mock as m } from "bun:test";\nm.module("x");',
    });
    expect(findings.get("alias.test.ts")).toEqual([
      {
        line: 2,
        message:
          "Avoid mock.module(). Replace the external boundary with an Effect service test Layer.",
      },
    ]);
  });
});

describe("noTestGlobals", () => {
  test("reports writes to global objects and process.env", () => {
    const results = lintCases("noTestGlobals", {
      extension: "test.ts",
      valid: [
        "const current = window.location.href;",
        "const window = {}; window.x = 1;",
        "function f(globalThis) { globalThis.a = 1; }",
        'const process = { env: {} }; process.env.FOO = "x";',
        'document.body.innerHTML = "<p></p>";',
        "const state = { count: 0 }; state.count += 1;",
        "process.exitCode = 1;",
      ],
      invalid: [
        "globalThis.fetch = () => 1;",
        "window.__STATE__ = {};",
        'window["__STATE__"] = state;',
        "window.location.href = next;",
        "global.counter++;",
        "self.cache ??= new Map();",
        "--globalThis.depth;",
        "delete window.__STATE__;",
        'process.env.FOO = "x";',
        "delete process.env.FOO;",
        'process.env["API_URL"] = url;',
        "process.env = {};",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("reports Reflect and Object calls that mutate a global object", () => {
    const results = lintCases("noTestGlobals", {
      extension: "test.ts",
      valid: [
        "Object.assign({}, window.location);",
        "const target = {}; Reflect.set(target, 'a', 1);",
        "const window = {}; Object.defineProperty(window, 'a', { value: 1 });",
        "const Reflect = { set: () => true }; Reflect.set(window, 'a', 1);",
        "Object.keys(process.env);",
      ],
      invalid: [
        'Reflect.set(window, "__STATE__", state);',
        'Reflect.defineProperty(globalThis, "fetch", { value: fake });',
        'Reflect.deleteProperty(process.env, "FOO");',
        'Object.defineProperty(window, "matchMedia", { value: fake });',
        "Object.defineProperties(globalThis, descriptors);",
        "Object.assign(window.location, { href: next });",
        'Object.assign(process.env, { FOO: "x" });',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("reports global and environment stubbing helpers", () => {
    const results = lintCases("noTestGlobals", {
      extension: "test.ts",
      valid: [
        'const vi = { stubGlobal: () => 1 }; vi.stubGlobal("fetch", fake);',
        'import { vi } from "vitest"; vi.useFakeTimers();',
      ],
      invalid: [
        'import { vi } from "vitest"; vi.stubGlobal("fetch", fake);',
        'import { vi } from "vitest"; vi.stubEnv("FOO", "x");',
        'import { vi } from "vitest"; vi.unstubAllGlobals();',
        'import { vi } from "bun:test"; vi.unstubAllEnvs();',
        'import { jest } from "@jest/globals"; jest.replaceProperty(config, "mode", "test");',
        'import { jest } from "bun:test"; jest.replaceProperty(config, "mode", "test");',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("reports runner globals that no import provides", () => {
    const results = lintCases("noTestGlobals", {
      extension: "test.ts",
      valid: [
        'import { describe, expect, it } from "bun:test"; describe("x", () => { it("y", () => { expect(1).toBe(1); }); });',
        'import { it } from "effect-bun-test"; it.effect("y", () => program);',
        'import { describe as suite } from "bun:test"; suite("x", () => {});',
        "const test = (name) => name; test('x');",
        "const runner = { describe: () => 1 }; runner.describe();",
      ],
      invalid: [
        'describe("x", () => {});',
        'import { describe } from "bun:test"; describe("x", () => { it("y", () => {}); });',
        "expect(1).toBe(1);",
        "beforeEach(() => {});",
        "const fn = mock(() => 1);",
        'spyOn(service, "run");',
        "jest.fn();",
        'fit("x", () => {});',
        'xdescribe("x", () => {});',
        'xtest("x", () => {});',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("names the runner global and the written global", () => {
    const findings = lintFixtures("noTestGlobals", {
      "suite.test.ts": [
        'import { it } from "bun:test";',
        'describe("x", () => { it("y", () => {}); });',
        "globalThis.fetch = fake;",
        'Reflect.set(window, "__STATE__", state);',
      ].join("\n"),
    });
    // Runner globals resolve once the whole module is scoped, so they report last.
    expect(findings.get("suite.test.ts")).toEqual([
      {
        line: 3,
        message:
          "Avoid writing globalThis.fetch in tests. Provide the capability through an Effect service or runtime input.",
      },
      {
        line: 4,
        message:
          "Avoid Reflect.set() on window in tests. Provide the capability through an Effect service or runtime input.",
      },
      {
        line: 2,
        message: "Import describe from your test library instead of using the runner global.",
      },
    ]);
  });
});

describe("noTestGlobals scope", () => {
  test("skips application modules", () => {
    const findings = lintFixtures("noTestGlobals", {
      "bootstrap.ts": 'window.__STATE__ = {};\ndescribe("x", () => {});',
      "bootstrap.test.ts": "window.__STATE__ = {};",
    });
    expect(findings.get("bootstrap.ts")).toEqual([]);
    expect(findings.get("bootstrap.test.ts")).toHaveLength(1);
  });
});

describe("noFixedWaitInTests", () => {
  test("reports waits a test blocks on and keeps sleeps used as values", () => {
    const results = lintCases("noFixedWaitInTests", {
      extension: "test.ts",
      valid: [
        'import { Effect } from "effect"; const fake = { frame: () => Effect.sleep("5 millis") };',
        'import * as Effect from "effect/Effect"; const slow = Effect.sleep("1 minute").pipe(Effect.forkChild);',
        'import { TestClock } from "effect/testing"; function* t() { yield* TestClock.adjust("1 minute"); }',
        "const Effect = { sleep: () => 1 }; Effect.sleep(10);",
        "const later = () => setTimeout(done, 10);",
        "new Promise((resolve) => emitter.once('ready', resolve));",
        'import { setTimeout } from "./fake-timers.js"; await setTimeout(10);',
      ],
      invalid: [
        'import { Effect } from "effect"; function* t() { yield* Effect.sleep("200 millis"); }',
        'import * as E from "effect/Effect"; function* t() { yield* E.sleep("200 millis"); }',
        "async function t() { await Bun.sleep(100); }",
        "Bun.sleepSync(100);",
        "async function t() { await page.waitForTimeout(300); }",
        "const wait = () => Effect.promise(() => page.waitForTimeout(100));",
        "const settle = () => new Promise((r) => setTimeout(r, 0));",
        "await new Promise(function (resolve) { setTimeout(resolve, 50); });",
        'import { setTimeout as sleep } from "node:timers/promises"; await sleep(10);',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("skips application modules and explains the replacement", () => {
    const findings = lintFixtures("noFixedWaitInTests", {
      "poll.ts": "async function poll() { await Bun.sleep(100); }",
      "poll.test.ts": "async function t() {\n  await Bun.sleep(100);\n}",
    });
    expect(findings.get("poll.ts")).toEqual([]);
    expect(findings.get("poll.test.ts")).toEqual([
      {
        line: 2,
        message:
          "Avoid a fixed wait in tests (Bun.sleep). A fixed wait guesses when state changes, so it flakes under load and slows the suite. Advance virtual time with TestClock.adjust, or wait on the event itself: a Deferred, Latch, or Queue in Effect code, a condition or locator assertion (expect.poll, waitForFunction) in a browser.",
      },
    ]);
  });
});

describe("effect.testFiles setting", () => {
  const fixtures = {
    "tests/support/helpers.ts": "window.__STATE__ = {};",
    "packages/e2e/src/driver.ts": "window.__STATE__ = {};",
    "packages/e2e-tools/src/driver.ts": "window.__STATE__ = {};",
    "src/tests.ts": "window.__STATE__ = {};",
    "src/app.test.ts": "window.__STATE__ = {};",
  };

  test("adds the matching files to the test modules every test rule reads", () => {
    const findings = lintFixtures("noTestGlobals", fixtures, {
      settings: { effect: { testFiles: ["**/tests/**", "packages/e2e/**"] } },
    });
    expect(reportedLines(findings, "tests/support/helpers.ts")).toEqual([1]);
    expect(reportedLines(findings, "packages/e2e/src/driver.ts")).toEqual([1]);
    expect(reportedLines(findings, "packages/e2e-tools/src/driver.ts")).toEqual([]);
    expect(reportedLines(findings, "src/tests.ts")).toEqual([]);
    expect(reportedLines(findings, "src/app.test.ts")).toEqual([1]);
  });

  test("keeps test and spec modules alone without the setting", () => {
    const findings = lintFixtures("noTestGlobals", fixtures);
    expect(reportedLines(findings, "tests/support/helpers.ts")).toEqual([]);
    expect(reportedLines(findings, "src/app.test.ts")).toEqual([1]);
  });

  test("exempts configured test files from rules that skip tests", () => {
    const findings = lintFixtures(
      "noModuleLevelMutableState",
      { "tests/support/counter.ts": "let count = 0;\nexport const next = () => count;\n" },
      { settings: { effect: { testFiles: ["tests/**"] } } },
    );
    expect(reportedLines(findings, "tests/support/counter.ts")).toEqual([]);
  });
});
