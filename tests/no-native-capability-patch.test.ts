import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures } from "./support/lint-fixtures.js";

describe("noNativeCapabilityPatch", () => {
  // LANDMINES probe/cases/doubles.test.ts lines 10, 11 and 12, and each
  // capability. Mutants: a capability dropped from the list (Date.now,
  // Math.random, crypto, navigator, storage); a global root not stripped;
  // defineProperty or Reflect.set unread; save-replace-restore unread; a
  // restore in afterEach exempted (it must stay reported); an event handler
  // reported (navigator.serviceWorker.onmessage is valid); a member saved but
  // never restored reported; a local variable swapped and restored reported.
  test("reports native patches and saved-replaced-restored members, with the service to use", () => {
    const results = lintCases("noNativeCapabilityPatch", {
      extension: "test.ts",
      valid: [
        "navigator.serviceWorker.onmessage = (event) => record(event);",
        "window.onerror = () => {};",
        "const now = Date.now();",
        "const state = { now: 0 }; state.now = 1;",
        "let current = 1; const saved = current; current = 2; current = saved;",
        "const saved = api.load; api.load = () => 2;",
        "Object.defineProperty(result, 'value', { value: 1 });",
        "localStorage.getItem('k');",
      ],
      invalid: [
        "Date.now = () => 0;",
        "performance.now = () => 0;",
        "Math.random = () => 0.5;",
        "crypto.randomUUID = () => '00000000-0000-0000-0000-000000000000';",
        "globalThis.crypto.getRandomValues = (a) => a;",
        "Object.defineProperty(navigator, 'onLine', { value: false });",
        "Reflect.set(window.navigator, 'clipboard', fake);",
        "localStorage.setItem = () => {};",
        "window.sessionStorage = memory;",
        "test('x', () => { const saved = api.load; api.load = () => 2; expect(api.load()).toBe(2); api.load = saved; });",
        "let real; beforeEach(() => { real = Date.now; Date.now = () => 0; }); afterEach(() => { Date.now = real; });",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  // Mutant: the service named wrongly or not at all (the message is the fix).
  test("names the service whose test layer replaces the patch", () => {
    const findings = lintFixtures("noNativeCapabilityPatch", {
      "clock.test.ts": "Date.now = () => 0;\nMath.random = () => 0;\n",
      "clock.ts": "Date.now = () => 0;\n",
    });
    const messages = (findings.get("clock.test.ts") ?? []).map((finding) => finding.message);
    expect(messages[0]).toContain("TestClock");
    expect(messages[1]).toContain("Random layer");
    expect(findings.get("clock.ts")).toEqual([]);
  });
});
