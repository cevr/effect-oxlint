// The review's probes (tests/probes/review-1, tests/probes/review-2), each file
// as the review wrote it, linted with the rule and options the review ran it
// with: every line the rule reports, and what it says where the review found
// a message that claimed more than the code shows.
import { describe, expect, test } from "bun:test";

import { type Finding, type LintConfig, lintFixtures } from "./support/lint-fixtures.js";
import { probes } from "./support/probes.js";

/** Each probe's reported lines, by its path. */
const linesOf = (
  rule: string,
  paths: ReadonlyArray<string>,
  config: LintConfig = {},
): Readonly<Record<string, ReadonlyArray<number>>> => {
  const findings = lintFixtures(rule, probes(...paths), config);
  return Object.fromEntries(
    paths.map((path) => [path, (findings.get(path) ?? []).map((finding) => finding.line)]),
  );
};

/** Each probe's findings, by its path. */
const findingsOf = (
  rule: string,
  paths: ReadonlyArray<string>,
  config: LintConfig = {},
): Readonly<Record<string, ReadonlyArray<Finding>>> => {
  const findings = lintFixtures(rule, probes(...paths), config);
  return Object.fromEntries(paths.map((path) => [path, findings.get(path) ?? []]));
};

describe("requireSpawnBudget, on the review's probes", () => {
  test("a group, a fixture and a hook are not tests; a test on a group's parameter is judged on its own", () => {
    expect(
      linesOf("requireSpawnBudget", [
        "review-2/layer-spawn.test.ts",
        "review-2/layer-spawn-2.test.ts",
        "review-2/c2-vitest-spawn.test.ts",
        "review-2/c2-vitest-describe-param.test.ts",
        "review-1/spawn.test.ts",
        "review-1/vitest-spawn.test.ts",
      ]),
    ).toEqual({
      "review-2/layer-spawn.test.ts": [],
      // P1 and P2 at their inner tests, P4 itself; P5's group names the timeout.
      "review-2/layer-spawn-2.test.ts": [10, 19, 37],
      "review-2/c2-vitest-spawn.test.ts": [],
      // D2's inner test, on its describe's parameter, names none.
      "review-2/c2-vitest-describe-param.test.ts": [13],
      "review-1/spawn.test.ts": [4, 9, 21],
      "review-1/vitest-spawn.test.ts": [15],
    });
  });

  test("says what the test calls, and through which function of the file", () => {
    const findings = findingsOf("requireSpawnBudget", [
      "review-1/spawn.test.ts",
      "review-1/vitest-spawn.test.ts",
    ]);
    expect(findings["review-1/spawn.test.ts"]?.map((finding) => finding.message)).toEqual([
      "This test calls `Bun.spawnSync` and names no timeout: starting a process takes the machine's time, and a loaded machine can run past the runner's default. Give the test its budget in milliseconds after its body, or as { timeout } in its options.",
      "This test calls `Bun.spawnSync` and names no timeout: starting a process takes the machine's time, and a loaded machine can run past the runner's default. Give the test its budget in milliseconds after its body, or as { timeout } in its options.",
      "This test calls `helper`, which leads to a call of `Bun.spawnSync`, and names no timeout: starting a process takes the machine's time, and a loaded machine can run past the runner's default. Give the test its budget in milliseconds after its body, or as { timeout } in its options.",
    ]);
    expect(findings["review-1/vitest-spawn.test.ts"]?.map((finding) => finding.message)).toEqual([
      "This test calls `ChildProcess.make` and names no timeout: the command starts a process when a platform spawner runs it, and starting a process takes the machine's time, so a loaded machine can run past the runner's default. Give the test its budget in milliseconds after its body, or as { timeout } in its options.",
    ]);
  });
});

describe("requireForceKillAfter, on the review's probes", () => {
  test("a SIGKILL command is not reported; the report names the signal the spawner sends", () => {
    const findings = findingsOf("requireForceKillAfter", [
      "review-2/c2-forcekill.ts",
      "review-2/forcekill-params.ts",
      "review-1/vitest-spawn.test.ts",
    ]);
    expect(
      Object.fromEntries(
        Object.entries(findings).map(([path, found]) => [path, found.map((f) => f.line)]),
      ),
    ).toEqual({
      "review-2/c2-forcekill.ts": [6, 8],
      "review-2/forcekill-params.ts": [14, 35],
      "review-1/vitest-spawn.test.ts": [16],
    });
    expect(findings["review-2/c2-forcekill.ts"]?.map((finding) => finding.message)).toEqual([
      'ChildProcess.make without forceKillAfter: on interrupt or timeout the spawner sends the command\'s killSignal, SIGINT, waits 1 s, then waits for exit with no bound, so a child that ignores SIGINT holds its scope open forever. Name forceKillAfter in the command options, such as `forceKillAfter: "5 seconds"`.',
      'ChildProcess.make without forceKillAfter: on interrupt or timeout the spawner sends SIGTERM (no killSignal is named), waits 1 s, then waits for exit with no bound, so a child that ignores SIGTERM holds its scope open forever. Name forceKillAfter in the command options, such as `forceKillAfter: "5 seconds"`.',
    ]);
  });
});

describe("noGlobals, on the review's probes", () => {
  test("a function handed to a call, block body or not, is no hold; the claims the changeset makes hold", () => {
    expect(
      linesOf("noGlobals", [
        "review-2/c2-noglobals-thunk.ts",
        "review-2/noglobals-claims.ts",
        "review-2/noglobals-common.ts",
        "review-2/c2-noglobals-empty.ts",
        "review-1/holds.ts",
        "review-1/hops.ts",
        "review-1/pointfree.ts",
        "review-1/pointfree2.ts",
        "review-1/spawn.test.ts",
        "review-1/vitest-spawn.test.ts",
      ]),
    ).toEqual({
      "review-2/c2-noglobals-thunk.ts": [],
      "review-2/noglobals-claims.ts": [11, 12, 13, 14, 17, 19, 20, 22],
      "review-2/noglobals-common.ts": [12, 15],
      "review-2/c2-noglobals-empty.ts": [2, 3, 4],
      "review-1/holds.ts": [15, 19, 22],
      "review-1/hops.ts": [],
      "review-1/pointfree.ts": [7, 16],
      "review-1/pointfree2.ts": [16],
      "review-1/spawn.test.ts": [5, 10, 15, 19],
      "review-1/vitest-spawn.test.ts": [6, 11],
    });
  });

  test("a configuration that bans nothing reports no hold", () => {
    const empty = ["review-2/c2-noglobals-empty.ts", "review-1/nobuiltins.ts"];
    expect(linesOf("noGlobals", empty, { options: [{ builtins: false }] })).toEqual({
      "review-2/c2-noglobals-empty.ts": [],
      "review-1/nobuiltins.ts": [],
    });
    expect(
      linesOf("noGlobals", empty, { options: [{ builtins: false, members: { Bun: [] } }] }),
    ).toEqual({ "review-2/c2-noglobals-empty.ts": [], "review-1/nobuiltins.ts": [] });
    expect(
      linesOf("noGlobals", empty, {
        options: [
          {
            builtins: false,
            members: { Bun: { properties: [], use: "an Effect platform service" } },
          },
        ],
      }),
    ).toEqual({ "review-2/c2-noglobals-empty.ts": [], "review-1/nobuiltins.ts": [] });
  });
});

describe("noPointFreeLog, on the review's probes", () => {
  test("only a logger in a callback's place; a reducer's report names the accumulator", () => {
    const findings = findingsOf("noPointFreeLog", [
      "review-2/c2-pointfree.ts",
      "review-1/pointfree.ts",
      "review-1/pointfree2.ts",
    ]);
    expect(
      Object.fromEntries(
        Object.entries(findings).map(([path, found]) => [path, found.map((f) => f.line)]),
      ),
    ).toEqual({
      "review-2/c2-pointfree.ts": [7, 9],
      "review-1/pointfree.ts": [7, 16, 19],
      "review-1/pointfree2.ts": [16],
    });
    expect(findings["review-2/c2-pointfree.ts"]?.[0]?.message).toBe(
      "console.log passed point-free prints every argument it is given, and an array's reduce passes the accumulator, the element, the index and the array, so all four print. Write a reducer that logs what it means to, such as (total, line) => { console.log(line); return total; }.",
    );
  });
});

describe("noInterruptibleMemo, on the review's probes", () => {
  test("a namespace named Effect from another module is not effect's", () => {
    expect(linesOf("noInterruptibleMemo", ["review-2/c2-memo-foreign.ts"])).toEqual({
      "review-2/c2-memo-foreign.ts": [],
    });
  });
});
