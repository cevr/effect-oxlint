import type { Visitor } from "../vendor/effect-oxlint/index.js";

/** Test and spec modules: `*.test.*` and `*.spec.*` with a JS or TS extension. */
const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

export const isTestFile = (filename: string): boolean => testFilePattern.test(filename);

/** Visitor for a file a rule does not apply to. */
export const skipFile: Visitor.EffectVisitor = {};
