import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const pluginPath = new URL("../../dist/plugin.js", import.meta.url).pathname;

export interface Finding {
  readonly line: number;
  readonly message: string;
}

/**
 * Lint named fixture files through the compiled plugin with one rule enabled.
 *
 * Returns the findings for each fixture, keyed by its file name, so tests can
 * choose test and non-test file names and assert on every file at once.
 */
export const lintFixtures = (
  rule: string,
  fixtures: Readonly<Record<string, string>>,
): ReadonlyMap<string, ReadonlyArray<Finding>> => {
  const directory = mkdtempSync(join(tmpdir(), "oxlint-plugin-effect-"));
  const findings = new Map<string, Array<Finding>>();
  for (const [name, source] of Object.entries(fixtures)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), source);
    findings.set(name, []);
  }
  writeFileSync(
    join(directory, "oxlint.json"),
    JSON.stringify({ jsPlugins: [pluginPath], rules: { [`effect/${rule}`]: "error" } }),
  );
  const result = Bun.spawnSync(
    ["bunx", "oxlint", "--format", "unix", "--config", "oxlint.json", ...Object.keys(fixtures)],
    { cwd: directory, env: process.env, stderr: "pipe", stdout: "pipe" },
  );
  rmSync(directory, { force: true, recursive: true });
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    // oxlint-disable-next-line effect/noThrowStatement, effect/noNewError -- bun:test harness: a crashed oxlint must fail the calling test
    throw new Error(`oxlint failed: ${new TextDecoder().decode(result.stderr)}`);
  }
  const output = new TextDecoder().decode(result.stdout);
  for (const match of output.matchAll(/^(.+?):(\d+):\d+: (.+) \[Error\/effect\((\w+)\)\]$/gmu)) {
    const [, file = "", line = "0", message = "", reported = ""] = match;
    if (reported !== rule) continue;
    findings.get(file)?.push({ line: Number(line), message });
  }
  return findings;
};

/** Lines reported in one fixture, in source order. */
export const reportedLines = (
  findings: ReadonlyMap<string, ReadonlyArray<Finding>>,
  file: string,
): ReadonlyArray<number> => (findings.get(file) ?? []).map((finding) => finding.line);

export interface CaseResults {
  /** Valid cases that were reported, with their findings. */
  readonly reportedValid: ReadonlyArray<
    readonly [source: string, findings: ReadonlyArray<Finding>]
  >;
  /** Invalid cases that were not reported. */
  readonly missedInvalid: ReadonlyArray<string>;
}

/**
 * Lint each case as its own file with one rule enabled, in a single oxlint run.
 *
 * Every valid case must produce no finding and every invalid case at least one.
 * Pass `extension` for cases that need a different file kind, such as `test.ts`.
 */
export const lintCases = (
  rule: string,
  cases: {
    readonly valid: ReadonlyArray<string>;
    readonly invalid: ReadonlyArray<string>;
    readonly extension?: string;
  },
): CaseResults => {
  const extension = cases.extension ?? "ts";
  const valid = cases.valid.map(
    (source, index) => [`valid-${index}.${extension}`, source] as const,
  );
  const invalid = cases.invalid.map(
    (source, index) => [`invalid-${index}.${extension}`, source] as const,
  );
  const findings = lintFixtures(rule, Object.fromEntries([...valid, ...invalid]));
  return {
    reportedValid: valid
      .map(([file, source]) => [source, findings.get(file) ?? []] as const)
      .filter(([, reported]) => reported.length > 0),
    missedInvalid: invalid
      .filter(([file]) => (findings.get(file) ?? []).length === 0)
      .map(([, source]) => source),
  };
};
