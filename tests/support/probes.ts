import { readFileSync } from "node:fs";

const root = new URL("../probes/", import.meta.url).pathname;

/**
 * The review probes, by their path under `tests/probes/` (`review-2/c2-forcekill.ts`),
 * each file as the review wrote it, so a fixture lints exactly what the review ran.
 */
export const probes = (...paths: ReadonlyArray<string>): Readonly<Record<string, string>> =>
  Object.fromEntries(paths.map((path) => [path, readFileSync(`${root}${path}`, "utf8")]));
