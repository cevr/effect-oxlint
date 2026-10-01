import { describe, expect, test } from "bun:test";

import {
  type LintConfig,
  lintCases,
  lintFixtures,
  reportedLines,
} from "./support/lint-fixtures.js";

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

describe("noEffectBunTestItCall", () => {
  test("reports a call of effect-bun-test's it under any local name", () => {
    const results = lintCases("noEffectBunTestItCall", {
      extension: "test.ts",
      valid: [
        'import { it } from "effect-bun-test"; it.live("runs", () => Effect.void);',
        'import { it } from "effect-bun-test"; it.effect("runs", () => Effect.void);',
        'import { it } from "bun:test"; it("runs", () => {});',
        'import { it } from "@effect/vitest"; it("runs", () => {});',
        'import { it } from "effect-bun-test"; const run = (it) => it("x"); run(test);',
        'import * as ebt from "effect-bun-test"; ebt.it.live("runs", () => Effect.void);',
        'it("uses the runner global", () => {});',
      ],
      invalid: [
        'import { it } from "effect-bun-test"; it("runs", () => {});',
        'import { it as spec } from "effect-bun-test"; spec("runs", () => {});',
        'import * as ebt from "effect-bun-test"; ebt.it("runs", () => {});',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("noPromiseChainsInTests", () => {
  test("reports then, catch, and finally chains on non-Effect receivers", () => {
    const results = lintCases("noPromiseChainsInTests", {
      extension: "test.ts",
      valid: [
        'import { Effect } from "effect"; const recovered = Effect.catch(program, () => Effect.void);',
        'import * as Stream from "effect/Stream"; const safe = Stream.catch(stream, () => Stream.empty);',
        'import { Effect as E } from "effect"; E.catch(program, recover);',
        "const handlers = { then: 1 }; const value = handlers.then;",
      ],
      invalid: [
        "load().then((value) => value);",
        "client.fetch().catch(() => 0);",
        "task.finally(() => cleanup());",
        "Effect.runPromise(program).then(check);",
        'import { Effect } from "./local.js"; run().catch(recover);',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("skips application modules", () => {
    const findings = lintFixtures("noPromiseChainsInTests", {
      "client.ts": "load().then(check);",
      "client.test.ts": "load().then(check);",
    });
    expect(reportedLines(findings, "client.ts")).toEqual([]);
    expect(reportedLines(findings, "client.test.ts")).toEqual([1]);
  });
});

describe("noTimeoutDieInTests", () => {
  test("reports a die whose message describes a timeout", () => {
    const results = lintCases("noTimeoutDieInTests", {
      extension: "test.ts",
      valid: [
        'Effect.die("fixture missing");',
        "Effect.dieMessage(`index ${index} out of range`);",
        'Effect.fail(new WaitTimeout({ message: "timed out" }));',
        'log("timed out");',
        'Effect.die(new FixtureError({ message: "fixture missing" }));',
        'Effect.die({ timeout: 5, reason: "fixture missing" });',
        'Effect.die({ ...timeoutDefaults, reason: "fixture missing" });',
      ],
      invalid: [
        'Effect.die(new WaitForError({ message: "timed out waiting for server" }));',
        'Effect.die({ reason: "gave up on the socket" });',
        'Effect.die(new Error("stuck", { cause: { why: `timeout` } }));',
        'Effect.die(["poll", "timed out"]);',
        'Effect.die({ [reasonKey]: "gave up" });',
        'Effect.die("timed out waiting for the stream");',
        "Effect.dieMessage(`waitFor gave up after ${attempts} attempts`);",
        'Effect.die(new Error("Timeout: " + label));',
        'Effect.die("still " + "waiting for idle");',
        'import { Effect as E } from "effect"; E.die("Time out");',
        'Effect.die({ message: "timed out waiting for event" satisfies string });',
        'Effect.die("gave up" as string);',
        'Effect.die(<string>"waiting for idle");',
        'Effect.die(new WaitError({ message: ("timed out" as const) }));',
        'Effect.die(["poll", "timeout"]!);',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("skips application modules", () => {
    const findings = lintFixtures("noTimeoutDieInTests", {
      "poll.ts": 'Effect.die("timed out");',
      "poll.test.ts": 'Effect.die("timed out");',
    });
    expect(reportedLines(findings, "poll.ts")).toEqual([]);
    expect(reportedLines(findings, "poll.test.ts")).toEqual([1]);
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
        'import * as Effect from "effect/Effect"; Effect.sleep("1 minute").pipe(Effect.forkChild);',
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

  test("reports each sleep inside a waited expression, not one a nested function builds", () => {
    const findings = lintFixtures("noFixedWaitInTests", {
      "poll.test.ts": [
        'import { Clock, Effect } from "effect";',
        "export const poll = Effect.gen(function* () {",
        '  yield* Effect.sleep("2 millis").pipe(Effect.provideService(Clock.Clock, wallClock));', // 3
        '  yield* settled.pipe(Effect.raceFirst(Effect.sleep("300 millis")));', // 4
        '  yield* Effect.andThen(Effect.sleep("10 millis"), settled);', // 5
        '  const bound = yield* Effect.sleep("10 millis");', // 6
        '  yield* Effect.all([Effect.sleep("1 millis"), Effect.sleep("2 millis")]);', // 7 (twice)
        '  yield* withReader({ read: () => Effect.sleep("1 second") });',
        '  yield* Effect.forEach(items, () => Effect.sleep("1 millis"));',
        "  return bound;",
        "});",
        "export const host = async () => {",
        "  await Promise.race([Bun.sleep(10), Promise.resolve()]);", // 13
        "  await Promise.all([Bun.sleepSync(1)]);", // 14
        "  await run(async () => Bun.sleep(10));",
        "};",
        "",
      ].join("\n"),
    });
    expect(reportedLines(findings, "poll.test.ts")).toEqual([3, 4, 5, 6, 7, 7, 13, 14]);
    expect(findings.get("poll.test.ts")?.[0]?.message).toContain(
      "Avoid a fixed wait in tests (Effect.sleep).",
    );
  });

  test("reports a sleep stored under a name, not one a function builds", () => {
    const findings = lintFixtures("noFixedWaitInTests", {
      "view.test.ts": [
        'import { Effect, Layer } from "effect";',
        "export const stored = Effect.gen(function* () {",
        '  const pause = Effect.sleep("10 millis");', // 3
        "  yield* pause;",
        "});",
        "export const mountView = Effect.gen(function* () {",
        '  return { settle: Effect.sleep("100 millis") };', // 7
        "});",
        'export const fence = Effect.sleep("5 seconds").pipe(Effect.as(-1));', // 9
        "export const hostFence = Bun.sleep(5);", // 10
        'export const forked = Effect.sleep("1 minute").pipe(Effect.forkChild);', // 11
        'export const reader = Layer.succeed(Reader, { read: () => Effect.sleep("1 second") });',
        'export const frame = { next: () => Effect.sleep("5 millis"), sleep: 1 };',
        "export const delayed = (ms: number) => { const wait = Effect.sleep(ms); return wait; };", // 14
        'export const waitedOnce = Effect.gen(function* () { const r = yield* Effect.sleep("1 millis"); return r; });', // 15, as a wait
        "export const later = (ms: number) => Effect.sleep(ms);",
        "",
      ].join("\n"),
    });
    expect(reportedLines(findings, "view.test.ts")).toEqual([3, 7, 9, 10, 11, 14, 15]);
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

  test("reports fixed waits in configured test helpers", () => {
    const findings = lintFixtures(
      "noFixedWaitInTests",
      { "tests/support/wait.ts": "async function settle() { await Bun.sleep(10); }" },
      { settings: { effect: { testFiles: ["tests/**"] } } },
    );
    expect(reportedLines(findings, "tests/support/wait.ts")).toEqual([1]);
  });
});

/** Lint each source as its own test file in one oxlint run: the reported lines of each. */
const linesOf = (
  rule: string,
  sources: ReadonlyArray<string>,
  extension = "test.ts",
  config: LintConfig = {},
): ReadonlyArray<ReadonlyArray<number>> => {
  const files = sources.map((source, index) => [`case-${index}.${extension}`, source] as const);
  const findings = lintFixtures(rule, Object.fromEntries(files), config);
  return files.map(([file]) => reportedLines(findings, file));
};

/** A generator body for cases that `yield*`: its first line is line 2 of the file. */
const inGen = (...lines: ReadonlyArray<string>): string =>
  ["Effect.gen(function* () {", ...lines, "});"].join("\n");

describe("noRepoTempDirectory", () => {
  const lines = (sources: ReadonlyArray<string>) => linesOf("noRepoTempDirectory", sources);

  test("a directory option under import.meta is reported", () => {
    const source = inGen(
      "const root = yield* fs.makeTempDirectoryScoped({",
      '  directory: path.resolve(import.meta.dir, "../.."),',
      '  prefix: "gent-x-",',
      "})",
    );
    expect(lines([source])).toEqual([[3]]);
  });

  test("a bound name spelled inside a string literal is no repo path", () => {
    expect(
      lines([
        inGen(
          'const login = path.resolve(import.meta.dir, "fixtures")',
          'const dir = yield* fs.makeTempDirectoryScoped({ prefix: "gent-login-" })',
        ),
        inGen(
          'const login = path.resolve(import.meta.dir, "fixtures")',
          'const label = "login screen"',
          "const dir = yield* fs.makeTempDirectoryScoped({ prefix: label })",
        ),
      ]),
    ).toEqual([[], []]);
  });

  test("a directory option naming a binding from import.meta is reported", () => {
    const source = inGen(
      'const packageRoot = path.resolve(import.meta.dir, "../../..")',
      'const dir = yield* fs.makeTempDirectoryScoped({ directory: packageRoot, prefix: "x-" })',
    );
    expect(lines([source])).toEqual([[3]]);
  });

  test("a tmp path of any spelling joined to a repo path is reported", () => {
    expect(
      lines([
        'const TEST_DIR = join(import.meta.dir, "../../.tmp-ext-integration")',
        'const dir = join(import.meta.dir, ".tmp")',
        'const dir = join(__dirname, "tmp", "case")',
        'const dir = path.resolve(import.meta.dirname, "../temp-fixtures")',
        "const dir = `${import.meta.dir}/.tmp`",
      ]),
    ).toEqual([[1], [1], [1], [1], [1]]);
  });

  test("a temp directory call rooted in the repo is reported, whatever its prefix", () => {
    expect(
      lines([
        'const dir = mkdtempSync(join(__dirname, "fixture-"))',
        'const dir = mkdtempSync(path.join("packages/core/tests", "case-"))',
        inGen('const dir = yield* fs.makeTempDirectory({ directory: resolve("./apps/tui") })'),
        inGen(
          "const packageRoot = path.resolve(__dirname, '..')",
          "const dir = yield* fs.makeTempDirectoryScoped({",
          '  prefix: "case-",',
          "  directory: packageRoot,",
          "})",
        ),
        'const options = { directory: "./scratch" }; const dir = mkdtempSync(options);',
      ]),
    ).toEqual([[1], [1], [2], [5], [1]]);
  });

  test("a temp directory rooted in the working directory is reported", () => {
    expect(
      lines([
        'const dir = mkdtempSync(join(process.cwd(), "tmp-"))',
        inGen("const dir = yield* fs.makeTempDirectoryScoped({ directory: process.cwd() })"),
        inGen('const dir = yield* fs.makeTempDirectoryScoped({ directory: path.resolve("out") })'),
        inGen('const dir = yield* fs.makeTempDirectoryScoped({ directory: "./scratch" })'),
        'const dir = mkdtempSync("case-")',
        ["const here = process.cwd()", 'const dir = mkdtempSync(join(here, "case-"))'].join("\n"),
      ]),
    ).toEqual([[1], [2], [2], [2], [1], [2]]);
  });

  test("an absolute prefix and a helper that takes a prefix pass", () => {
    const source = inGen(
      'const a = mkdtempSync("/tmp/gent-case-")',
      "const b = mkdtempSync(`${tmpdir()}/gent-case-`)",
      'const c = yield* fs.makeTempDirectoryScoped({ directory: "/nonexistent/gent-probe-x" })',
      'const d = yield* makeTempDirectoryScoped("gent-case-")',
    );
    expect(lines([source])).toEqual([[]]);
  });

  test("a system temp directory and a read of the source tree pass", () => {
    const source = inGen(
      'const root = yield* fs.makeTempDirectoryScoped({ prefix: "gent-x-" })',
      'const dir = path.resolve(import.meta.dir, "../../src/extensions")',
      "const other = yield* fs.makeTempDirectoryScoped({ directory: root })",
      'const sys = mkdtempSync(join(tmpdir(), "gent-case-"))',
      'const template = path.join(import.meta.dir, "templates", "prompt.md")',
    );
    expect(lines([source])).toEqual([[]]);
  });

  test("an array joined with a separator is no path literal", () => {
    expect(
      lines([
        inGen(
          'const suffix = ["a", "b"].join("")',
          "const dir = yield* fs.makeTempDirectoryScoped({ prefix: `gent-${suffix}-` })",
        ),
        'const text = ["tmp", "x"].join("\\n")',
        [
          'const label = parts.join(", ")',
          "const d = mkdtempSync(`/nonexistent/gent-probe-x/${label}`)",
        ].join("\n"),
      ]),
    ).toEqual([[], [], []]);
  });

  test("a local __dirname binding is no repo path", () => {
    expect(
      lines(['const __dirname = "/nonexistent/x"; const dir = join(__dirname, "tmp")']),
    ).toEqual([[]]);
  });

  test("a Windows drive path and a UNC path are absolute", () => {
    expect(
      lines([
        String.raw`const dir = mkdtempSync("C:\\Temp\\case-")`,
        'const dir = mkdtempSync("C:/Temp/case-")',
        String.raw`const dir = mkdtempSync("\\\\server\\share\\case-")`,
        inGen('const dir = yield* fs.makeTempDirectoryScoped({ directory: "D:\\\\Temp" })'),
        'const dir = join("C:/Temp", ".tmp")',
      ]),
    ).toEqual([[], [], [], [], []]);
  });

  test("a later absolute argument to resolve replaces the repo path before it", () => {
    expect(
      lines([
        'const dir = path.resolve(import.meta.dir, "/tmp")',
        'const dir = mkdtempSync(path.resolve(import.meta.dir, "/tmp/case-"))',
        'const dir = resolve("fixtures", "/var/tmp/x", "tmp")',
        'const dir = path.resolve(import.meta.dir, "C:\\\\Temp", ".tmp")',
        'const dir = path.resolve("/tmp", import.meta.dir, ".tmp")',
        'const dir = path.resolve("/x", "fixtures", ".tmp")',
        'const dir = path.join(import.meta.dir, "/tmp")',
      ]),
    ).toEqual([[], [], [], [], [1], [], [1]]);
  });

  test("product source is out of scope", () => {
    const source = 'const dir = join(import.meta.dir, ".tmp")';
    const findings = lintFixtures("noRepoTempDirectory", {
      "src/runtime/x.ts": source,
      "src/runtime/y.ts": 'const dir = { directory: path.resolve(import.meta.dir, "..") }',
      "tests/runtime/x.test.ts": source,
    });
    expect(reportedLines(findings, "src/runtime/x.ts")).toEqual([]);
    expect(reportedLines(findings, "src/runtime/y.ts")).toEqual([]);
    expect(reportedLines(findings, "tests/runtime/x.test.ts")).toEqual([1]);
  });
});

describe("noSharedTestHome", () => {
  /** gent's project keys, on top of the generic defaults. */
  const gentKeys = { options: [{ keys: ["GENT_DATA_DIR", "userDir", "projectDir"] }] };
  const lines = (sources: ReadonlyArray<string>, extension = "test.ts") =>
    linesOf("noSharedTestHome", sources, extension, gentKeys);

  test("a home or data directory under the shared temp root is reported, in every shape", () => {
    const source = inGen(
      'const env = { cwd: "/tmp", home: "/tmp" }',
      'RuntimeEnvironment.Live({ home: "/tmp/test-home", cwd: "/tmp" })',
      'const logs = logDirFor({ GENT_DATA_DIR: "/var/tmp/gent-scratch" })',
      'const platform = (home: string = "/private/tmp") => home',
      'const a = { home: overrides?.home ?? "/tmp" }',
      'const b = { homeDirectory: Effect.succeed("/dev/shm/x") }',
      "const facts = { home: tmpdir() }",
      'process.env.HOME = "/tmp"',
    );
    const jsx = [
      "const view = (",
      '  <WorkspaceProvider cwd={cwd} home="/tmp" services={services}></WorkspaceProvider>',
      ");",
    ].join("\n");
    // Each key is its own finding, so a line with two keys reports twice.
    expect(lines([source])).toEqual([[2, 2, 3, 3, 4, 5, 6, 7, 8, 9]]);
    expect(lines([jsx], "test.tsx")).toEqual([[2]]);
  });

  test("a working or extension directory under the shared temp root is reported like a home", () => {
    const source = inGen(
      'const { sessionId } = yield* client.session.create({ cwd: "/tmp" })',
      'const alphaCwd = "/tmp/gent-alpha-profile"',
      'loadClientExtensions({ userDir: "/tmp/user", projectDir: "/tmp/project" })',
      'const host = { ...(yield* runtimeHostContext({ ...parent, sessionCwd: "/tmp" })) }',
      "const facts = { cwd: tmpdir() }",
    );
    expect(lines([source])).toEqual([[2, 3, 4, 4, 5, 6]]);
  });

  test("the project keys come from the option", () => {
    const source = [
      'const logs = logDirFor({ GENT_DATA_DIR: "/tmp/gent" })',
      'const env = { HOME: "/tmp" }',
    ].join("\n");
    expect(linesOf("noSharedTestHome", [source])).toEqual([[2]]);
    expect(lines([source])).toEqual([[1, 2]]);
  });

  test("a scoped temp home, a path no test can create, or a temp path under another name is not reported", () => {
    const source = inGen(
      'const home = yield* fs.makeTempDirectoryScoped({ prefix: "gent-home-" })',
      'const env = { cwd: "/nonexistent/gent-test-cwd", home: "/nonexistent/gent-test-home" }',
      "RuntimeEnvironment.Live({ home, cwd })",
      'RuntimeEnvironment.Live({ home: root, cwd: yield* makeTempDirectoryScoped("gent-cwd-") })',
      'const workspace = workspaceIdForCwd("/tmp/run-workspace")',
      'const loaded = { extension, scope: "user", sourcePath: "/tmp/good.ts" }',
      'const home2 = mkdtempSync(join(tmpdir(), "gent-home-"))',
      'const homePage = "/tmp/page"',
      '// home: "/tmp" in a comment',
      'if (home === "/tmp/x") return',
      'const probe = home => "/tmp/x"',
      'const temp = "/tmpfiles"',
    );
    expect(lines([source])).toEqual([[]]);
  });

  test("the value is read as an expression: across a line break, in a template or a join", () => {
    const source = [
      "const env = {",
      "  home:",
      '    "/tmp",',
      "}",
      "const a = { home: `${tmpdir()}/case` }",
      'const b = { home: Path.join(tmpdir(), "case") }',
      'const c = { home: path.join("/tmp", "case") }',
      "const d = { home: `/tmp/${name}` }",
    ].join("\n");
    expect(lines([source])).toEqual([[2, 5, 6, 7, 8]]);
  });

  test("a shared path in a sibling property does not make a unique home shared", () => {
    const sources = [
      'const home = mkdtempSync(join(tmpdir(), "gent-home-")); const opts = { directory: "/tmp" }',
      inGen(
        'const env = { home: yield* makeTempDirectoryScoped("gent-home-"), directory: "/tmp" }',
      ),
      'const env2 = { home: root, directory: "/tmp" }',
      inGen('const env3 = { home: yield* fs.makeTempDirectoryScoped({ directory: "/tmp" }) }'),
      'const env4 = { home: mkdtempSync("/tmp/gent-home-") }',
      'const env5 = { home: `${root}/it\'s`, directory: "/tmp" }',
    ];
    expect(lines(sources)).toEqual([[], [], [], [], [], []]);
  });

  test("a test layer in product source is read, the product code around it is not", () => {
    const source = [
      "export class GentPlatform extends Context.Service<GentPlatform>()(TAG) {",
      "  static Live = Layer.succeed(GentPlatform, {",
      '    homeDirectory: Effect.succeed("/tmp"),',
      "  })",
      '  static Test = (prefix = "id"): Layer.Layer<GentPlatform> =>',
      "    Layer.effect(",
      "      GentPlatform,",
      "      Effect.gen(function* () {",
      "        return GentPlatform.of({",
      '          homeDirectory: Effect.succeed("/tmp"),',
      "        })",
      "      }),",
      "    )",
      "  static Other = Layer.succeed(GentPlatform, {",
      '    homeDirectory: Effect.succeed("/tmp"),',
      "  })",
      "}",
      "export const FakeTestActor = (config: {",
      "  readonly id: string",
      "}) =>",
      '  Layer.succeed(Actor, { home: "/tmp" })',
      'const fallback = { home: "/tmp", cwd: "/tmp" }',
    ].join("\n");
    expect(lines([source], "ts")).toEqual([[10, 21]]);
  });

  test("a `static readonly Test` member and a `Test:` object key are test layers", () => {
    const source = [
      "export class Platform extends Context.Service<Platform>()(TAG) {",
      "  static readonly Test = Layer.succeed(Platform, {",
      '    homeDirectory: Effect.succeed("/tmp"),',
      "  })",
      "}",
      "export const Layers = {",
      '  Live: Layer.succeed(Platform, { home: "/tmp" }),',
      "  Test: Layer.succeed(Platform, {",
      '    home: "/tmp",',
      "  }),",
      "}",
    ].join("\n");
    expect(lines([source], "ts")).toEqual([[3, 9]]);
  });

  test("an example extension's test layer is read as product source is", () => {
    const source = [
      'const live = { home: "/tmp" }',
      "export const NotesTest = Layer.succeed(Notes, {",
      '  home: "/tmp",',
      "})",
    ].join("\n");
    expect(lines([source], "ts")).toEqual([[3]]);
  });

  test("a binding with a `Test` word part that is no layer is product code", () => {
    const source = [
      "const runTestTool = (toolCall: ToolCall) =>",
      '  run(toolCall, { cwd: "/tmp" })',
      "export const isTestMode = (config: Config) =>",
      '  config.home === "/tmp"',
      "const TestModeLabel = {",
      '  cwd: "/tmp",',
      "}",
      "const makeTestLayer = () =>",
      '  Layer.succeed(Platform, { home: "/tmp" })',
    ].join("\n");
    expect(lines([source], "ts")).toEqual([[9]]);
  });

  test("a configured test harness is test code", () => {
    const findings = lintFixtures(
      "noSharedTestHome",
      {
        "src/test-utils/harness.ts": 'const facts = { homeDirectory: Effect.succeed("/tmp") }',
        "src/runtime/platform.ts": 'const facts = { homeDirectory: Effect.succeed("/tmp") }',
      },
      { settings: { effect: { testFiles: ["src/test-utils/**"] } } },
    );
    expect(reportedLines(findings, "src/test-utils/harness.ts")).toEqual([1]);
    expect(reportedLines(findings, "src/runtime/platform.ts")).toEqual([]);
  });

  test("regex, division, JSX and type parameter forms around a home are read as code", () => {
    const home = '\nconst env = { cwd: "/tmp" }';
    expect(
      lines(
        [
          "if (ok) /[/*]/.test(s)",
          "while (next()) /[/*]/.test(s)",
          "for (const s of all) /[/*]/.test(s)",
          "if (ok) f(); else /[/*]/.test(s)",
          "const re = /*comment*/ /[/*]/",
          "const re = // a note\n  /[/*]/",
          "const half = (a + b) / 2 /* a note */",
          "const half = f(a) / 2 /* a note */",
          "const f = <Row>(a: Row) => a",
        ].map((source) => `${source}${home}`),
      ).map((reported) => reported.length),
    ).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(
      lines(
        [
          'const f = <A,>(a: A) => a; const env = { cwd: "/tmp" }',
          'const f = <A extends object>(a: A) => a; const env = { cwd: "/tmp" }',
          'const f = <Row = unknown,>(x: Row) => x; const env = { cwd: "/tmp" }',
          'const f = <Row=unknown,>(x: Row) => x; const env = { cwd: "/tmp" }',
          'type F = <Row>(x: Row) => Row; const env = { cwd: "/tmp" }',
          'mount({ cwd: pick(dir), note: "/tmp/log" })',
          'mount({ cwd: pick(<box></box>, dir), note: "/tmp/log" })',
          'mount({ cwd: pick(<text>it\'s</text>, dir), note: "/tmp/log" })',
          'mount({ cwd: pick(<box title="a/b" />, dir), note: "/tmp/log" })',
          'mount({ cwd: pick(<><text>{`it\'s`}</text></>, dir), note: "/tmp/log" })',
          'mount({ cwd: pick(<X>it\'s</X>, dir), note: "/tmp/log" })',
        ],
        "test.tsx",
      ).map((reported) => reported.length),
    ).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
  });
});
