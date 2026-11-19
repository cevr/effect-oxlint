import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures } from "./support/lint-fixtures.js";

describe("noUnsignaledPoll", () => {
  // LANDMINES probe/cases/flake.test.ts lines 9 to 12 and a counter loop.
  // Mutants: a poll of `.mock` unread; a poll of `.length`/`.size` unread; a
  // spy matcher after expect.poll unread (and through .not); vi.waitFor
  // unread; a counter loop unread. And the valid side: a poll of ref.current
  // is reported; a poll of a locator is reported; a loop that drains a
  // queue or walks an array (no time wait) is reported; a for loop is read.
  test("reports polls of spy state and counts; keeps polls of state and loops that wait on no time", () => {
    const results = lintCases("noUnsignaledPoll", {
      extension: "test.ts",
      valid: [
        "await expect.poll(() => ref.current).toBe(1);",
        "await expect.poll(() => page.getByRole('button').isVisible()).toBe(true);",
        "await expect.poll(async () => (await client.get('/status')).state).toBe('done');",
        "await vi.waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());",
        "while (queue.length > 0) { await handle(queue.shift()); }",
        "for (let i = 0; i < items.length; i++) { await sleep(items[i]); }",
        "await expect(spy).toHaveBeenCalledTimes(1);",
      ],
      invalid: [
        "await expect.poll(() => spy.mock.calls.length).toBe(1);",
        "await expect.poll(() => requests.length).toBe(2);",
        "await expect.poll(() => seen.size).toBe(2);",
        "await expect.poll(() => spy).toHaveBeenCalledTimes(1);",
        "await expect.poll(() => spy).not.toHaveBeenCalled();",
        "await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));",
        "await vi.waitFor(() => { expect(requests.length).toBe(2); });",
        "await waitFor(() => expect(handler.mock.calls[0]).toEqual([1]));",
        "while (spy.mock.calls.length < 1) { await Bun.sleep(10); }",
        "do { await sleep(5); } while (requests.length < 2);",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  // Mutant: the rule run outside test modules.
  test("applies to test modules only", () => {
    const source = "await expect.poll(() => requests.length).toBe(2);\n";
    const findings = lintFixtures("noUnsignaledPoll", { "a.ts": source, "a.test.ts": source });
    expect(findings.get("a.ts")).toEqual([]);
    expect(findings.get("a.test.ts")).toHaveLength(1);
  });
});
