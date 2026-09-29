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
