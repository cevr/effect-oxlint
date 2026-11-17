/**
 * A stand-in for `@cevr/tn1-lint`'s binary, for the tn1Lint rule's tests:
 * a shell script with the binary's command line (`lint --rule NAME WEIGHTS -`,
 * the text on its standard input) that flags the first `NARRATE` in the text it reads, at its UTF-8
 * byte offset, as the real binary reports spans. It fails as the binary
 * does when the weights file cannot be read. The real binary's records and
 * findings are held by the Ergo repository's examples/tn1-lint cases.
 */
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = [
  "#!/bin/sh",
  '[ "$1" = lint ] && [ "$2" = --rule ] || { echo "usage: tn1-lint lint --rule NAME WEIGHTS FILE..." >&2; exit 2; }',
  '[ -r "$4" ] || { echo "tn1-lint: cannot read weights $4" >&2; exit 1; }',
  "off=$(LC_ALL=C grep -bo NARRATE - | head -n 1 | cut -d: -f1)",
  'if [ -z "$off" ]; then printf \'{"diagnostics":[],"number_of_files":1,"number_of_rules":1}\'; exit 0; fi',
  'printf \'{"diagnostics":[{"message":"%s: flagged by a local network (p=0.900, model stub)","code":"ergo-tn1(%s)","severity":"advice","filename":"%s","labels":[{"span":{"offset":%s,"length":7}}]}],"number_of_files":1,"number_of_rules":1}\' "$3" "$3" "$5" "$off"',
  "",
].join("\n");

/** A folder holding the stub at `tn1-lint` and a readable weights file at `w.tn1`. */
export const tn1Stub = () => {
  const directory = mkdtempSync(join(tmpdir(), "tn1-stub-"));
  const binary = join(directory, "tn1-lint");
  writeFileSync(binary, script);
  chmodSync(binary, 0o755);
  const weights = join(directory, "w.tn1");
  writeFileSync(weights, "TN1 stub weights\n");
  return { binary, weights };
};
