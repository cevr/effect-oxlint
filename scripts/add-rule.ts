/**
 * Scaffold a new rule file with boilerplate.
 *
 * Usage: bun run scripts/add-rule.ts <rule-name> [--dry-run]
 *
 * Examples:
 *   bun run scripts/add-rule.ts no-effect-zip
 *   bun run scripts/add-rule.ts no-await-in-effect --dry-run
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ruleName = args.find((a) => !a.startsWith("--"));
const unsupportedFlag = args.find(
  (argument) => argument.startsWith("--") && argument !== "--dry-run",
);

if (unsupportedFlag !== undefined) {
  console.error(`Unsupported flag: ${unsupportedFlag}`);
  process.exit(1);
}

if (!ruleName) {
  console.error("Usage: bun run scripts/add-rule.ts <rule-name> [--dry-run]");
  process.exit(1);
}

if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(ruleName)) {
  console.error(`Invalid rule name: ${ruleName}. Use lower-case kebab-case.`);
  process.exit(1);
}

// Convert kebab-case to camelCase
const camelCase = ruleName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const filePath = join(import.meta.dir, `../src/rules/${ruleName}.ts`);

if (existsSync(filePath)) {
  console.error(`✗ File already exists: ${filePath}`);
  process.exit(1);
}

const basicTemplate = `/**
 * TODO: Description for ${ruleName}
 */
import type { ESTree } from "@oxlint/plugins"
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const ${camelCase} = Rule.define({
  name: "${ruleName}",
  meta: Rule.meta({
    type: "suggestion",
    description: "TODO: describe what this rule checks.",
  }),
  create: function* () {
    const context = yield* RuleContext
    return {
      Identifier: (node: ESTree.IdentifierName) =>
        node.name === "TODO_NAME"
          ? context.report(
              Diagnostic.make({
                node,
                message: "TODO: explain the replacement.",
              }),
            )
          : Effect.void,
    }
  },
})
`;

if (dryRun) {
  console.log(basicTemplate);
  process.exit(0);
}

writeFileSync(filePath, basicTemplate);
console.log(`✓ Created ${filePath}`);
console.log(`  Export name: ${camelCase}`);
console.log(`  Run \`bun run codegen\` to update src/rules/index.ts`);
