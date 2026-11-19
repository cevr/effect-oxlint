/**
 * A stand-in for `@cvr/tn1-lint`'s binary, for the tn1Lint rule's tests:
 * a shell script with the binary's command line (`lint --rule NAME WEIGHTS -`,
 * the text on its standard input) that flags the first `NARRATE` in the text it reads, at its UTF-8
 * byte offset, as the real binary reports spans. It fails as the binary
 * does when the weights file cannot be read. The real binary's records and
 * findings are held by the Ergo repository's examples/tn1-lint cases.
 *
 * Its report has tn1-lint's `Report` shape (`@cvr/tn1-lint/wire`), the
 * span's line and column at 0. `span` replaces the span's fields, for a
 * report that is not that shape.
 */
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = (span: string) =>
  [
    "#!/bin/sh",
    '[ "$1" = lint ] && [ "$2" = --rule ] || { echo "usage: tn1-lint lint --rule NAME WEIGHTS FILE..." >&2; exit 2; }',
    '[ -r "$4" ] || { echo "tn1-lint: cannot read weights $4" >&2; exit 1; }',
    "off=$(LC_ALL=C grep -bo NARRATE - | head -n 1 | cut -d: -f1)",
    'if [ -z "$off" ]; then printf \'{"diagnostics":[],"number_of_files":1,"number_of_rules":1}\'; exit 0; fi',
    `printf '{"diagnostics":[{"message":"%s: flagged by a local network (p=0.900, model stub)","code":"ergo-tn1(%s)","severity":"advice","filename":"%s","labels":[{"span":{${span}}}]}],"number_of_files":1,"number_of_rules":1}' "$3" "$3" "$5" "$off"`,
    "",
  ].join("\n");

/** A folder holding the stub at `tn1-lint` and a readable weights file at `w.tn1`. */
export const tn1Stub = (span = '"offset":%s,"length":7,"line":0,"column":0') => {
  const directory = mkdtempSync(join(tmpdir(), "tn1-stub-"));
  const binary = join(directory, "tn1-lint");
  writeFileSync(binary, script(span));
  chmodSync(binary, 0o755);
  const weights = join(directory, "w.tn1");
  writeFileSync(weights, "TN1 stub weights\n");
  return { binary, weights };
};

/**
 * The fixture files of an installed `@cvr/tn1-lint` at the lint root: its
 * manifest, its real wire module (the generated `wire.js` of the published
 * package this repository depends on).
 */
export const tn1Package = () => ({
  "node_modules/@cvr/tn1-lint/package.json": '{ "name": "@cvr/tn1-lint", "main": "lint.js" }',
  "node_modules/@cvr/tn1-lint/wire.js": readFileSync(
    createRequire(import.meta.url).resolve("@cvr/tn1-lint/wire"),
    "utf8",
  ),
});

/** The fixture file of the installed package's `lint.js`, holding `text`. */
export const tn1LintJs = (text: string) => ({ "node_modules/@cvr/tn1-lint/lint.js": text });
