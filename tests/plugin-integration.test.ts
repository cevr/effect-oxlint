import { describe, expect, test } from "bun:test";

const packageRoot = new URL("..", import.meta.url).pathname;

const runFixture = (fixture: string) =>
  Bun.spawnSync(
    ["bunx", "oxlint", "--format", "unix", "--config", "tests/integration/oxlint.json", fixture],
    {
      cwd: packageRoot,
      env: process.env,
      stderr: "pipe",
      stdout: "pipe",
    },
  );

const runAntiSlopFixture = (fixture: string) =>
  Bun.spawnSync(
    [
      "bunx",
      "oxlint",
      "--format",
      "unix",
      "--config",
      "tests/integration/anti-slop-oxlint.json",
      fixture,
    ],
    {
      cwd: packageRoot,
      env: process.env,
      stderr: "pipe",
      stdout: "pipe",
    },
  );

describe("compiled oxlint plugin", () => {
  test("accepts the constrained Effect-native boundary fixture", () => {
    const result = runFixture("tests/integration/valid.ts");
    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).not.toContain("effect(");
  });

  test("reports every recommended rule through the real oxlint parser", () => {
    const result = runFixture("tests/integration/invalid.ts");
    const output = new TextDecoder().decode(result.stdout);
    expect(result.exitCode).toBe(1);
    for (const rule of [
      "maxCognitiveComplexity",
      "maxHalsteadDifficulty",
      "noAs",
      "noAsyncFunction",
      "noDynamicImports",
      "noEffectBind",
      "noEffectDo",
      "noGlobals",
      "noInlineProvide",
      "noManagedRuntimeInEffect",
      "noModuleMocks",
      "noNestedEffectGen",
      "noNewError",
      "noNewPromise",
      "noNodeBuiltinImport",
      "noNullish",
      "noPerCallCacheConstruction",
      "noRunCollectOnUnboundedStream",
      "noSequentialEffectAll",
      "noSilentCatchAll",
      "preferCatchTag",
      "preferEffectFn",
      "preferMatchTagsExhaustive",
      "preferPredicateIsTagged",
      "noTernary",
      "noTestLifecycleHooks",
      "noThrowStatement",
      "noTryCatch",
      "noUnboundedConcurrency",
      "noUnboundedRetry",
      "preferServiceOf",
      "requireNamedEffectFn",
    ]) {
      expect(output).toContain(`effect(${rule})`);
    }
    expect(output.match(/effect\(noAs\)/g)).toHaveLength(2);
    expect(output.match(/effect\(noNullish\)/g)).toHaveLength(5);
    expect(output.match(/effect\(noModuleMocks\)/g)).toHaveLength(2);
    expect(output.match(/effect\(preferCatchTag\)/g)).toHaveLength(4);
    expect(output.match(/effect\(preferMatchTagsExhaustive\)/g)).toHaveLength(3);
    expect(output.match(/effect\(preferPredicateIsTagged\)/g)).toHaveLength(1);
    expect(output.match(/effect\(noManagedRuntimeInEffect\)/g)).toHaveLength(1);
    expect(output.match(/effect\(noUnboundedConcurrency\)/g)).toHaveLength(2);
    expect(output.match(/effect\(noUnboundedRetry\)/g)).toHaveLength(4);
    expect(output.match(/effect\(preferServiceOf\)/g)).toHaveLength(2);
    expect(output.match(/effect\(noInlineProvide\)/g)).toHaveLength(1);
    expect(output.match(/effect\(noNestedEffectGen\)/g)).toHaveLength(1);
    expect(output.match(/effect\(noPerCallCacheConstruction\)/g)).toHaveLength(1);
    expect(output.match(/effect\(noRunCollectOnUnboundedStream\)/g)).toHaveLength(1);
    expect(output.match(/effect\(noSequentialEffectAll\)/g)).toHaveLength(1);
    expect(output.match(/effect\(noSilentCatchAll\)/g)).toHaveLength(1);
    expect(output.match(/effect\(requireNamedEffectFn\)/g)).toHaveLength(1);
  });

  test("reports every complexity limit with the measured value", () => {
    const result = runFixture("tests/integration/invalid.ts");
    const output = new TextDecoder().decode(result.stdout);
    expect(output).toContain("function has a complexity of 23. Maximum allowed is 21.");
    expect(output.match(/eslint\(complexity\)/g)).toHaveLength(1);
    expect(output).toContain("Function has a cognitive complexity of 26. Maximum allowed is 21.");
    expect(output).toContain("Function has a cognitive complexity of 22. Maximum allowed is 21.");
    expect(output.match(/effect\(maxCognitiveComplexity\)/g)).toHaveLength(2);
    expect(output).toContain("Function has a Halstead difficulty of 88.4. Maximum allowed is 79.");
    expect(output.match(/effect\(maxHalsteadDifficulty\)/g)).toHaveLength(1);
  });

  test("accepts evidence-preserving TypeScript through every anti-slop rule", () => {
    const result = runAntiSlopFixture("tests/integration/anti-slop-valid.ts");
    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).not.toContain("effect(");
  });

  test("reports every anti-slop rule through the real oxlint parser", () => {
    const result = runAntiSlopFixture("tests/integration/anti-slop-invalid.ts");
    const output = new TextDecoder().decode(result.stdout);
    expect(result.exitCode).toBe(1);
    for (const rule of [
      "noChainedTypeAssertions",
      "noConditionalEmptyObjectSpread",
      "noKnownValueWidening",
      "noObjectParameters",
      "noRuntimeTypeof",
      "noShapeInSymbolNames",
      "noUnknownParameters",
      "noUnknownTypeAliases",
      "noUnsafeDictionaryType",
      "noWidenThenAssert",
    ]) {
      expect(output).toContain(`effect(${rule})`);
    }
  });
});
