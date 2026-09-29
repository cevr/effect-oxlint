/**
 * Auto-generate src/rules/index.ts and src/presets/recommended.ts from rule files.
 *
 * Scans src/rules/ for rule files (ignoring _*.ts and index.ts),
 * extracts the exported const name, loads the rule to read its
 * `meta.docs.recommendedOptions`, and writes the barrel and the preset.
 *
 * Usage: bun run scripts/codegen.ts
 */
import type { CreateRule } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RULES_DIR = join(import.meta.dir, "../src/rules");
const INDEX_PATH = join(RULES_DIR, "index.ts");
const RECOMMENDED_PATH = join(import.meta.dir, "../src/presets/recommended.ts");
const check = process.argv.includes("--check");

/**
 * Native oxlint rules the recommended preset enables alongside the plugin.
 *
 * Cyclomatic complexity ships with oxlint, so the preset configures it
 * instead of re-implementing it. Its limit matches the cognitive limit.
 */
/** Rule options the preset can carry: a flat object of JSON scalars, such as `{ max: 21 }`. */
const RecommendedOptions = Schema.UndefinedOr(
  Schema.Record(Schema.String, Schema.Union([Schema.Number, Schema.String, Schema.Boolean])),
);
type RecommendedOptions = typeof RecommendedOptions.Type;

const nativeRules: ReadonlyArray<readonly [name: string, options: RecommendedOptions]> = [
  ["complexity", { max: 21 }],
];

interface RuleEntry {
  fileName: string;
  exportName: string;
  category: string;
  recommendedOptions: RecommendedOptions;
}

const categoryOrder = [
  "API bans",
  "Global bans",
  "Import bans",
  "Statement bans",
  "JSON",
  "AST pattern rules",
  "Effect-context rules",
  "Other",
];

function detectCategory(content: string, fileName: string): string {
  if (content.includes("makeEffectContextTracker")) return "Effect-context rules";
  if (content.includes("Rule.banImport") || content.includes("banImport")) return "Import bans";
  if (content.includes("Rule.banStatement")) return "Statement bans";
  if (content.includes("Rule.banMember") || content.includes("Rule.banMultiple")) {
    if (fileName.includes("global") || fileName.includes("new-")) return "Global bans";
    if (fileName.includes("json")) return "JSON";
    if (fileName.includes("process")) return "Global bans";
    return "API bans";
  }
  if (content.includes("Rule.banCallOf") || content.includes("banCallOf")) {
    if (fileName.includes("global") || fileName.includes("timer")) return "Global bans";
    return "API bans";
  }
  return "AST pattern rules";
}

function extractExportName(content: string): string | null {
  const match = content.match(/export const (\w+)/);
  return match?.[1] ?? null;
}

const files = readdirSync(RULES_DIR)
  .filter((f) => f.endsWith(".ts") && !f.startsWith("_") && f !== "index.ts")
  .sort();

const loadRecommendedOptions = (file: string, exportName: string) =>
  Effect.promise((): Promise<Record<string, CreateRule>> => import(join(RULES_DIR, file))).pipe(
    Effect.flatMap((module) =>
      Schema.decodeUnknownEffect(RecommendedOptions)(
        module[exportName]?.meta?.docs?.recommendedOptions,
      ),
    ),
    Effect.orDie,
  );

const loadEntry = (file: string) => {
  const content = readFileSync(join(RULES_DIR, file), "utf-8");
  const exportName = extractExportName(content);
  if (!exportName) {
    console.warn(`⚠ No export found in ${file}, skipping`);
    return Effect.succeed<ReadonlyArray<RuleEntry>>([]);
  }
  return loadRecommendedOptions(file, exportName).pipe(
    Effect.map(
      (recommendedOptions): ReadonlyArray<RuleEntry> => [
        {
          fileName: file.replace(".ts", ""),
          exportName,
          category: detectCategory(content, file),
          recommendedOptions,
        },
      ],
    ),
  );
};

const entries = (
  await Effect.runPromise(Effect.forEach(files, loadEntry, { concurrency: 8 }))
).flat();

/** Render a flat options object the way oxfmt formats it: `{ max: 21 }`. */
const formatOptions = (options: NonNullable<RecommendedOptions>): string => {
  const fields = Object.entries(options).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `{ ${fields.join(", ")} }`;
};

/** Quote a preset key only when oxfmt would: plugin-prefixed names need quotes, bare names do not. */
const presetKey = (name: string): string => (/^[A-Za-z_$][\w$]*$/u.test(name) ? name : `"${name}"`);

const presetEntry = (name: string, options: RecommendedOptions): string =>
  options === undefined
    ? `  ${presetKey(name)}: "error",`
    : `  ${presetKey(name)}: ["error", ${formatOptions(options)}],`;

// Group by category
const grouped = new Map<string, RuleEntry[]>();
for (const entry of entries) {
  const list = grouped.get(entry.category) ?? [];
  list.push(entry);
  grouped.set(entry.category, list);
}

// Build output
const lines: string[] = [
  "/**",
  " * All Effect oxlint rules, exported by rule name for Plugin.define.",
  " *",
  " * AUTO-GENERATED by scripts/codegen.ts — do not edit manually.",
  " */",
  "",
];

for (const cat of categoryOrder) {
  const catEntries = grouped.get(cat);
  if (!catEntries || catEntries.length === 0) continue;
  lines.push(`// --- ${cat} ---`);
  for (const entry of catEntries) {
    lines.push(`export { ${entry.exportName} } from "./${entry.fileName}.js";`);
  }
  lines.push("");
}

const indexOutput = lines.join("\n");
const recommendedOutput = [
  "/**",
  " * Strict, non-type-aware policy for Effect-native application code.",
  " *",
  " * AUTO-GENERATED by scripts/codegen.ts — do not edit manually.",
  " */",
  "export const recommended = {",
  ...nativeRules.map(([name, options]) => presetEntry(name, options)),
  ...entries.map((entry) => presetEntry(`effect/${entry.exportName}`, entry.recommendedOptions)),
  "} as const;",
  "",
].join("\n");

const generatedFiles = [
  [INDEX_PATH, indexOutput],
  [RECOMMENDED_PATH, recommendedOutput],
] as const;

if (check) {
  const staleFiles = generatedFiles.flatMap(([path, expected]) =>
    readFileSync(path, "utf-8") === expected ? [] : [path],
  );
  if (staleFiles.length > 0) {
    console.error(`Generated files are stale:\n${staleFiles.join("\n")}`);
    process.exit(1);
  }
  console.log(`✓ ${generatedFiles.length} generated files are current`);
  process.exit(0);
}

for (const [path, output] of generatedFiles) writeFileSync(path, output);

console.log(`✓ Generated ${generatedFiles.length} files with ${entries.length} rules`);
for (const [cat, catEntries] of grouped) {
  console.log(`  ${cat}: ${catEntries.length}`);
}
