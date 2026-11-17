/**
 * Advisory findings of TN1 networks, run by the `@cevr/tn1-lint` package.
 *
 * A TN1 network is a small all-integer (ternary) network that decides one
 * judgement an exact rule cannot, such as a comment that narrates the next
 * line. `@cevr/tn1-lint` is its linter: a native binary, the same on every
 * host, that reads TypeScript and prints oxlint's JSON report. This rule
 * does not bundle the engine or the weights: it runs the installed
 * package's binary on the file's text (as its standard input, `-`, so an unsaved buffer is
 * what is read), once per configured network, and reports each finding at
 * its span. A finding is a hint with a probability; configure the rule as
 * "warn". It is opt-in: install `@cevr/tn1-lint` beside the plugin and name
 * each network's weights file.
 *
 *   "effect/tn1Lint": ["warn", { "nets": { "narration": "lint/narration.tn1" } }]
 *
 * A missing package, a weights file it cannot read, or a run that fails is
 * one finding at the file's start, so a configured rule never goes quiet.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

const Options = Schema.UndefinedOr(
  Schema.Struct({
    nets: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    binary: Schema.optionalKey(Schema.String),
  }),
);

const Span = Schema.Struct({ offset: Schema.Number, length: Schema.Number });

const Report = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      message: Schema.String,
      labels: Schema.Array(Schema.Struct({ span: Span })),
    }),
  ),
});

const decodeReport = Schema.decodeUnknownOption(Schema.fromJsonString(Report));

/** A finding of one network: its message and its range in UTF-16 code units. */
interface Finding {
  readonly message: string;
  readonly range: readonly [number, number];
}

/** The bytes of a code point in UTF-8. */
const utf8Length = (point: number): number => {
  if (point < 0x80) return 1;
  if (point < 0x800) return 2;
  if (point < 0x10000) return 3;
  return 4;
};

/**
 * The UTF-16 index of each UTF-8 byte offset of `text`: the binary reports
 * byte offsets, oxlint ranges count UTF-16 code units.
 */
const utf16Index = (text: string): ((byte: number) => number) => {
  const units: Array<number> = [];
  let unit = 0;
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    const bytes = utf8Length(point);
    for (let index = 0; index < bytes; index++) units.push(unit);
    unit += char.length;
  }
  return (offset) => units[offset] ?? text.length;
};

/**
 * Why a start failed with ENOMEM on Linux: Node starts a process by fork,
 * and with the kernel's heuristic overcommit a fork fails when the parent
 * holds more writable memory than the host has free. oxlint holds a large
 * buffer per thread, so a run with fewer threads starts the binary.
 */
const hint = (error: Error): string => {
  if (!error.message.includes("ENOMEM")) return "";
  return " (the host could not copy oxlint's memory to start a process; run oxlint with --threads=4 or fewer)";
};

/** The package's binary: the `binary` option, else `@cevr/tn1-lint` as the lint root resolves it. */
const binaryOf = (cwd: string, binary: Option.Option<string>): Option.Option<string> =>
  Option.match(binary, {
    onSome: (path) => Option.some(resolve(cwd, path)),
    onNone: () =>
      Option.map(
        Option.liftThrowable(() =>
          createRequire(join(cwd, "package.json")).resolve("@cevr/tn1-lint/package.json"),
        )(),
        (manifest) => join(dirname(manifest), "bin", "tn1-lint"),
      ),
  });

/** The findings of one network on `text`, or why the run failed. */
const runNetwork = (
  binary: string,
  name: string,
  weights: string,
  text: string,
): Effect.Effect<ReadonlyArray<Finding>, string> =>
  Effect.suspend(() => {
    const run = spawnSync(binary, ["lint", "--rule", name, weights, "-"], {
      input: text,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    // A binary that exits before it reads its input (an unreadable weights
    // file) leaves the write with EPIPE: its exit status says why.
    const exited = Number.isInteger(run.status);
    if (run.error && !exited)
      return Effect.fail(`could not run ${binary}: ${run.error.message}${hint(run.error)}`);
    if (run.status !== 0) {
      const reason = run.stderr.trim().split("\n")[0] ?? `exit ${String(run.status)}`;
      return Effect.fail(`network ${name}: ${reason}`);
    }
    const toUnit = utf16Index(text);
    return Option.match(decodeReport(run.stdout), {
      onNone: () => Effect.fail(`network ${name}: tn1-lint printed no oxlint JSON report`),
      onSome: (report) =>
        Effect.succeed(
          report.diagnostics.flatMap((diagnostic) =>
            diagnostic.labels.map(({ span }): Finding => ({
              message: diagnostic.message,
              range: [toUnit(span.offset), toUnit(span.offset + span.length)],
            })),
          ),
        ),
    });
  });

export const tn1Lint = Rule.define({
  name: "tn1-lint",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Advisory findings of TN1 networks (small integer networks for judgements exact rules cannot make), run by the installed @cevr/tn1-lint package.",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: {
          nets: { type: "object", additionalProperties: { type: "string" } },
          binary: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ nets: {} }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const nets = Object.entries(options?.nets ?? {});
    const report = (message: string, [start, end]: readonly [number, number]) =>
      ctx.report(Diagnostic.make({ node: { range: [start, end] }, message }));
    const atStart = [0, 0] satisfies readonly [number, number];
    return {
      Program: () => {
        if (nets.length === 0) return Effect.void;
        return Option.match(binaryOf(ctx.cwd, Option.fromUndefinedOr(options?.binary)), {
          onNone: () =>
            report(
              "tn1-lint: the package @cevr/tn1-lint is not installed here; add it beside oxlint-plugin-effect, or set the rule's binary option.",
              atStart,
            ),
          onSome: (binary) =>
            Effect.forEach(
              nets,
              ([name, weights]) =>
                runNetwork(binary, name, resolve(ctx.cwd, weights), ctx.sourceCode.text).pipe(
                  Effect.flatMap((findings) =>
                    Effect.forEach(findings, (finding) => report(finding.message, finding.range), {
                      discard: true,
                    }),
                  ),
                  Effect.catch((reason) => report(`tn1-lint: ${reason}`, atStart)),
                ),
              { discard: true },
            ),
        });
      },
    };
  },
});
