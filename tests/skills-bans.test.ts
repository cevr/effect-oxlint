import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures } from "./support/lint-fixtures.js";
import type { ConfigValue } from "./support/lint-fixtures.js";

const clean = { reportedValid: [], missedInvalid: [] };

/** Whether each named fixture got a finding. */
const reportedFiles = (findings: ReadonlyMap<string, ReadonlyArray<unknown>>) =>
  Object.fromEntries([...findings].map(([file, list]) => [file, list.length > 0]));

describe("noEffectInFeature", () => {
  const feature =
    'import { useEffect } from "react";\nexport function Notes() {\n  useEffect(() => load(), []);\n  return <ul />;\n}\n';
  test("bans effects in feature code, keeps adapter hooks, adapter files and tests", () => {
    const findings = lintFixtures(
      "noEffectInFeature",
      {
        "notes/notes.tsx": feature,
        "notes/layout.tsx":
          'import React from "react";\nexport function Shell() {\n  React.useLayoutEffect(() => measure(), []);\n  return <main />;\n}\n',
        "notes/window.ts":
          'import { useEffect } from "react";\nexport function useWindowSizeSubscription() {\n  useEffect(() => listen(), []);\n}\n',
        "notes/socket.ts":
          'import { useEffect } from "react";\nexport function useSocketBridge() {\n  useEffect(() => listen(), []);\n}\n',
        "host/adapters/clock.tsx": feature,
        "notes/notes.test.tsx": feature,
      },
      { options: [{ adapters: ["host/adapters/**"] }] },
    );
    expect(reportedFiles(findings)).toEqual({
      "notes/notes.tsx": true,
      "notes/layout.tsx": true,
      "notes/window.ts": false,
      "notes/socket.ts": true,
      "host/adapters/clock.tsx": false,
      "notes/notes.test.tsx": false,
    });
  });

  test("adapterHooks replaces the default adapter-name pattern", () => {
    const findings = lintFixtures(
      "noEffectInFeature",
      {
        "socket.ts":
          'import { useEffect } from "react";\nexport function useSocketBridge() {\n  useEffect(() => listen(), []);\n}\n',
        "window.ts":
          'import { useEffect } from "react";\nexport function useWindowSizeSubscription() {\n  useEffect(() => listen(), []);\n}\n',
      },
      { options: [{ adapterHooks: "Bridge$" }] },
    );
    expect(reportedFiles(findings)).toEqual({ "socket.ts": false, "window.ts": true });
  });
});

describe("React 19 bans", () => {
  test("noForwardRef bans forwardRef in both spellings", () => {
    expect(
      lintCases("noForwardRef", {
        extension: "tsx",
        valid: ["export function Input({ ref }) {\n  return <input ref={ref} />;\n}\n"],
        invalid: [
          'import { forwardRef } from "react";\nexport const Input = forwardRef((props, ref) => <input ref={ref} />);\n',
          'import React from "react";\nexport const Input = React.forwardRef((props, ref) => <input ref={ref} />);\n',
        ],
      }),
    ).toEqual(clean);
  });

  test("preferUse bans useContext in both spellings, keeps use", () => {
    expect(
      lintCases("preferUse", {
        extension: "tsx",
        valid: ['import { use } from "react";\nexport const useNotes = () => use(NotesContext);\n',
          "function useContext() {\n  return store;\n}\nexport const read = () => useContext();\n",
        ],
        invalid: [
          'import { useContext } from "react";\nexport const useNotes = () => useContext(NotesContext);\n',
          'import React from "react";\nexport const useNotes = () => React.useContext(NotesContext);\n',
        ],
      }),
    ).toEqual(clean);
  });
});

describe("noParameterlessRenderProp", () => {
  test("reports render props that receive nothing, keeps ones that receive data", () => {
    expect(
      lintCases("noParameterlessRenderProp", {
        extension: "tsx",
        valid: [
          "export const a = <List renderItem={(item) => <Row item={item} />} />;\n",
          "export const b = <Card footer={() => <Close />} />;\n",
          "export const c = <Card renderFooter={footer} />;\n",
          "export const d = <Card render={() => <Close />} />;\n",
        ],
        invalid: [
          "export const a = <Card renderFooter={() => <Close />} />;\n",
          "export const b = <Card renderFooter={function () { return <Close />; }} />;\n",
        ],
      }),
    ).toEqual(clean);
  });
});

describe("noSilentContextDefault", () => {
  test("reports a default object with functions, keeps null and plain values", () => {
    expect(
      lintCases("noSilentContextDefault", {
        extension: "tsx",
        valid: [
          'import { createContext } from "react";\nexport const Notes = createContext<Notes | null>(null);\n',
          'import { createContext } from "react";\nexport const Theme = createContext({ dark: false, size: 2 });\n',
        ],
        invalid: [
          'import { createContext } from "react";\nexport const Notes = createContext({ add: () => {}, notes: [] });\n',
          'import React from "react";\nexport const Notes = React.createContext({ add() {} });\n',
        ],
      }),
    ).toEqual(clean);
  });
});

describe("noCauseRecoveryOutsideBoundary", () => {
  const recovery =
    'import { Effect } from "effect";\nexport const run = program.pipe(Effect.catchAllCause(() => Effect.void));\n';
  test("bans cause-level recovery outside boundary files, noted boundaries and tests", () => {
    const findings = lintFixtures(
      "noCauseRecoveryOutsideBoundary",
      {
        "notes/run.ts": recovery,
        "notes/sandbox.ts":
          'import { Effect } from "effect";\nexport const run = Effect.sandbox(program);\nexport const again = Effect.catchCause(program, f);\n',
        "notes/tagged.ts":
          'import { Effect } from "effect";\nexport const run = program.pipe(Effect.catchTag("NoteMissing", () => Effect.void));\n',
        "notes/noted.ts":
          'import { Effect } from "effect";\n// boundary: the worker loop keeps running after a failed job\nexport const run = program.pipe(Effect.catchAllCause(() => Effect.void));\n',
        "notes/empty-note.ts":
          'import { Effect } from "effect";\n// boundary:\nexport const run = program.pipe(Effect.catchAllCause(() => Effect.void));\n',
        "server/handler.ts": recovery,
        "notes/run.test.ts": recovery,
      },
      { options: [{ boundaries: ["server/**"] }] },
    );
    expect(reportedFiles(findings)).toEqual({
      "notes/run.ts": true,
      "notes/sandbox.ts": true,
      "notes/tagged.ts": false,
      "notes/noted.ts": false,
      "notes/empty-note.ts": true,
      "server/handler.ts": false,
      "notes/run.test.ts": false,
    });
    expect(findings.get("notes/sandbox.ts")).toHaveLength(2);
  });
});

describe("noKindNamedFiles", () => {
  test("reports kind folders and kind file names, keeps concept names and allowed globs", () => {
    const source = "export const a = 1;\n";
    const findings = lintFixtures(
      "noKindNamedFiles",
      {
        "src/services/notes.ts": source,
        "src/notes/note.service.ts": source,
        "src/notes/note-service.ts": source,
        "src/utils/dates.ts": source,
        "src/notes/utils.ts": source,
        "src/notes/date.helpers.ts": source,
        "src/notes/due-date.ts": source,
        "src/notes/serviceable.ts": source,
        "src/notes/note.ts": source,
        "vendor/utils/x.ts": source,
        "src/services/notes.test.ts": source,
        "src/notes/webservice.ts": source,
      },
      { options: [{ allow: ["vendor/**"] }] },
    );
    expect(reportedFiles(findings)).toEqual({
      "src/services/notes.ts": true,
      "src/notes/note.service.ts": true,
      "src/notes/note-service.ts": true,
      "src/utils/dates.ts": true,
      "src/notes/utils.ts": true,
      "src/notes/date.helpers.ts": true,
      "src/notes/due-date.ts": false,
      "src/notes/serviceable.ts": false,
      "src/notes/note.ts": false,
      "vendor/utils/x.ts": false,
      "src/services/notes.test.ts": false,
      "src/notes/webservice.ts": false,
    });
  });
});

describe("importBoundary", () => {
  const boundaries: ReadonlyArray<ConfigValue> = [
    {
      files: ["src/notes/*.ts"],
      deny: ["pg", "@aws-sdk/**", "src/notes/postgres/**", "src/orders/aggregate/**"],
      reason: "domain files import no vendor or adapter",
    },
    { files: ["packages/domain/**"], allowOnly: ["effect", "effect/**", "packages/domain/**"] },
  ];
  test("reports denied and not-allowed imports in every import form, by resolved path", () => {
    const findings = lintFixtures(
      "importBoundary",
      {
        "src/notes/store.ts": 'import { Pool } from "pg";\n',
        "src/notes/aws.ts": 'export { S3 } from "@aws-sdk/client-s3";\n',
        "src/notes/adapter.ts": 'export * from "./postgres/pool";\n',
        "src/notes/lazy.ts": 'export const load = () => import("../orders/aggregate/order");\n',
        "src/notes/note.ts": 'import { Effect } from "effect";\nimport { Due } from "./due-date";\n',
        "src/notes/postgres/pool.ts": 'import { Pool } from "pg";\n',
        "packages/domain/note.ts": 'import { Effect } from "effect";\nimport { Schema } from "effect/Schema";\nimport { Due } from "./due";\n',
        "packages/domain/leak.ts": 'import { Pool } from "pg";\n',
        "src/notes/store.test.ts": 'import { Pool } from "pg";\n',
      },
      { options: [{ boundaries }] },
    );
    expect(reportedFiles(findings)).toEqual({
      "src/notes/store.ts": true,
      "src/notes/aws.ts": true,
      "src/notes/adapter.ts": true,
      "src/notes/lazy.ts": true,
      "src/notes/note.ts": false,
      "src/notes/postgres/pool.ts": false,
      "packages/domain/note.ts": false,
      "packages/domain/leak.ts": true,
      "src/notes/store.test.ts": false,
    });
    expect(findings.get("src/notes/store.ts")).toEqual([
      { line: 1, message: expect.stringContaining("domain files import no vendor or adapter") },
    ]);
  });
});
