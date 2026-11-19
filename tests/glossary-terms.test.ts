import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { seededPick } from "./support/seeded.js";

const pool = [
  "buyer",
  "client",
  "order",
  "purchase",
  "payment",
  "request",
  "bill",
  "line",
  "viewer",
  "note",
] as const;
const kinds = [
  "const",
  "destructure",
  "param",
  "function",
  "class",
  "interface",
  "type",
  "objectKey",
  "constant",
  "import",
  "use",
] as const;

type Word = (typeof pool)[number];
type Kind = (typeof kinds)[number];

interface Declaration {
  readonly kind: Kind;
  readonly words: ReadonlyArray<Word>;
}

const capital = (word: string): string => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;

const declarationText = (d: Declaration, index: number): string => {
  const [first = "row", ...rest] = d.words;
  const camel = `${first}${rest.map(capital).join("")}${index}`;
  const pascal = `${d.words.map(capital).join("")}${index}`;
  const upper = `${d.words.map((word) => word.toUpperCase()).join("_")}_${index}`;
  return {
    const: `const ${camel} = 1;`,
    destructure: `const { ${camel} } = load();`,
    param: `export function run${index}(${camel}: number) {\n  return ${camel};\n}`,
    function: `function ${camel}() {}`,
    class: `class ${pascal} {}`,
    interface: `interface Row${index} {\n  ${camel}: string;\n}`,
    type: `type ${pascal} = number;`,
    objectKey: `export const row${index} = { ${camel}: 1 };`,
    constant: `const ${upper} = 1;`,
    import: `import { ${camel} } from "./lib";`,
    use: `sink(${camel});`,
  }[d.kind];
};

interface Glossary {
  readonly text: string;
  /** Each avoided entry as its words. */
  readonly avoided: ReadonlyArray<ReadonlyArray<Word>>;
}

/** A glossary of three terms, each with one or two avoided entries of one or two words. */
const glossaryOf = (pick: <A>(values: ReadonlyArray<A>) => A): Glossary => {
  const avoided: Array<ReadonlyArray<Word>> = [];
  const sections = ["Customer", "Invoice", "Reader"].map((term) => {
    const entries = Array.from({ length: pick([1, 2]) }, () =>
      Array.from({ length: pick([1, 1, 2]) }, () => pick(pool)),
    );
    avoided.push(...entries);
    const list = entries.map((words) => words.join(pick([" ", "-"]))).join(", ");
    return `**${term}**:\nA thing the shop names ${term}.\n_Avoid_: ${list}\n`;
  });
  return { text: `# Shop\n\n${sections.join("\n")}`, avoided };
};

/** The reference: a declared name whose words hold an avoided entry's words in a row. */
const owed = (glossary: Glossary, d: Declaration): boolean => {
  if (d.kind === "import" || d.kind === "use") return false;
  const name = ` ${d.words.join(" ")} `;
  return glossary.avoided.some((entry) => name.includes(` ${entry.join(" ")} `));
};

describe("glossaryTerms", () => {
  const seed = 1119;
  const pick = seededPick(seed);
  const glossary = glossaryOf(pick);
  const files: ReadonlyArray<ReadonlyArray<Declaration>> = Array.from({ length: 100 }, () =>
    Array.from({ length: 3 }, () => ({
      kind: pick(kinds),
      words: Array.from({ length: pick([1, 2, 3]) }, () => pick(pool)),
    })),
  );
  const name = (index: number) => `src/module-${index}.ts`;
  const source = (declarations: ReadonlyArray<Declaration>) =>
    `${declarations.map(declarationText).join("\n")}\n`;
  const fixtures = {
    "GLOSSARY.md": glossary.text,
    ...Object.fromEntries(files.map((declarations, index) => [name(index), source(declarations)])),
  };

  test("reports a declared name iff its words hold an avoided entry", () => {
    const findings = lintFixtures("glossaryTerms", fixtures, {
      options: [{ glossary: "GLOSSARY.md" }],
    });
    const wrong = files.flatMap((declarations, index) => {
      const got = (findings.get(name(index)) ?? []).length;
      const want = declarations.filter((d) => owed(glossary, d)).length;
      if (got === want) return [];
      return [{ seed, index, got, want, glossary: glossary.text, source: source(declarations) }];
    });
    expect(wrong).toEqual([]);
  });

  test("does nothing without a glossary, or with one that cannot be read", () => {
    const sample = Object.fromEntries(Object.entries(fixtures).slice(0, 20));
    for (const options of [[], [{ glossary: "missing/GLOSSARY.md" }]]) {
      const findings = lintFixtures("glossaryTerms", sample, { options });
      expect([...findings.values()].flat()).toEqual([]);
    }
  });
});
