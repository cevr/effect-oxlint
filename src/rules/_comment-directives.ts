/** Tool directives that live in comments: suppressions, type-check and Effect diagnostics switches. */

/**
 * A directive at the start of a comment line, after any JSDoc `*` gutter.
 * The rules and reason run to the next directive or the end of the comment.
 */
export const directivePattern =
  /(?:^|\n)[\t *]*(?<name>(?:oxlint|eslint)-disable(?:-next-line|-line)?|@effect-diagnostics(?:-next-line)?|@ts-(?:expect-error|ignore|nocheck))(?=$|[\s:])/gu;

/**
 * Comments that instruct a tool rather than a reader: suppressions and
 * type-check switches, triple-slash references, bundler annotations and
 * magic comments, JSX pragmas, and formatter and coverage ignores. Matched against the whole
 * comment with its JSDoc gutter removed.
 */
const toolDirective =
  /^(?:(?:oxlint|eslint)-(?:disable|enable)(?:-next-line|-line)?|@effect-diagnostics(?:-next-line)?|@ts-(?:expect-error|ignore|nocheck|check)|\/\s*<(?:reference|amd-module|amd-dependency)\b|[#@]__(?:PURE|NO_SIDE_EFFECTS|KEY)__$|@vite-ignore$|(?:webpack[A-Z]\w*|turbopackIgnore)\s*:|@jsx(?:ImportSource|Frag|Runtime)?\s|(?:prettier|oxfmt)-ignore|(?:c8|v8|istanbul)\s+ignore\b)/u;

/** The comment's text with its JSDoc gutter removed and its lines joined. */
const unwrap = (value: string): string =>
  value
    .replace(/^\*/u, "")
    .split("\n")
    .map((line) => line.replace(/^[\t *]*/u, ""))
    .join(" ")
    .trim();

/** Whether a comment holds only a tool directive, so removing it would change what a tool does. */
export const isToolDirective = (value: string): boolean => toolDirective.test(unwrap(value));
