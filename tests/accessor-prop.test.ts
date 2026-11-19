import { describe, expect, test } from "bun:test";

import { lintFixtures } from "./support/lint-fixtures.js";
import { seededPick, when } from "./support/seeded.js";

const sources = [
  "Component",
  "ParentComponent",
  "VoidComponent",
  "FlowComponent",
  "otherGeneric",
  "functionParam",
  "arrowParam",
  "lowerCaseFunction",
  "context",
] as const;
const typeForms = ["literal", "interface", "alias", "intersection"] as const;
const members = {
  value: { text: "routes: Route[]", accessor: false },
  getter: { text: "routes: () => Route[]", accessor: true },
  oneArg: { text: "routes: (page: number) => Route[]", accessor: false },
  accessor: { text: "routes: Accessor<Route[]>", accessor: true },
  method: { text: "routes(): Route[]", accessor: true },
  methodArg: { text: "routes(page: number): Route[]", accessor: false },
  handler: { text: "onPick: () => void", accessor: false },
  callback: { text: "close: () => void", accessor: false },
  callbackMethod: { text: "close(): void", accessor: false },
  getterName: { text: "getLabel: () => string", accessor: false },
  slot: { text: "renderRow: () => JSX.Element", accessor: false },
  children: { text: "children: () => JSX.Element", accessor: false },
} as const;
type Member = keyof typeof members;
const memberKeys = Object.keys(members).filter((key): key is Member => key in members);
const importForms = ["solid", "react", "none"] as const;

interface Case {
  readonly source: (typeof sources)[number];
  readonly typeForm: (typeof typeForms)[number];
  readonly member: Member;
  readonly imports: (typeof importForms)[number];
  readonly test: boolean;
}

const source = (c: Case): string => {
  const literal = `{ readonly title: string; ${members[c.member].text} }`;
  const declared = {
    literal: "",
    interface: `interface TableProps ${literal}`,
    alias: `type TableProps = ${literal};`,
    intersection: `type Base = { readonly title: string };\ntype TableProps = Base & ${literal};`,
  }[c.typeForm];
  const props = { true: literal, false: "TableProps" }[`${c.typeForm === "literal"}`];
  const body = "<ul>{props.title}</ul>";
  const owner = {
    Component: `export const Table: Component<${props}> = (props) => ${body};`,
    ParentComponent: `export const Table: ParentComponent<${props}> = (props) => ${body};`,
    VoidComponent: `export const Table: VoidComponent<${props}> = (props) => ${body};`,
    FlowComponent: `export const Table: FlowComponent<${props}> = (props) => ${body};`,
    otherGeneric: `export const Table: Widget<${props}> = (props) => ${body};`,
    functionParam: `export function Table(props: ${props}) {\n  return ${body};\n}`,
    arrowParam: `export const Table = (props: ${props}) => ${body};`,
    lowerCaseFunction: `export function table(props: ${props}) {\n  return ${body};\n}`,
    context: `export const TableContext = createContext<${props}>();`,
  }[c.source];
  const importLine = {
    solid:
      'import { createContext, type Accessor, type Component, type FlowComponent, type JSX, type ParentComponent, type VoidComponent } from "solid-js";',
    react: 'import { createContext, type JSX } from "react";',
    none: 'import { createContext } from "./context";',
  }[c.imports];
  return `${importLine}\ntype Route = { readonly path: string };\n${when(declared !== "", `${declared}\n`)}${owner}\n`;
};

const propsSources: ReadonlySet<string> = new Set([
  "Component",
  "ParentComponent",
  "VoidComponent",
  "FlowComponent",
  "functionParam",
  "arrowParam",
]);

const reported = (c: Case): boolean =>
  !c.test && c.imports === "solid" && propsSources.has(c.source) && members[c.member].accessor;

describe("noAccessorProp", () => {
  const seed = 1119;
  const pick = seededPick(seed);
  const cases: ReadonlyArray<Case> = Array.from({ length: 160 }, () => ({
    source: pick(sources),
    typeForm: pick(typeForms),
    member: pick(memberKeys),
    imports: pick(["solid", "solid", "solid", "react", "none"] as const),
    test: pick([false, false, false, true]),
  }));
  const name = (c: Case, index: number) => `probe-${index}${when(c.test, ".test")}.tsx`;
  const files = Object.fromEntries(cases.map((c, index) => [name(c, index), source(c)]));

  test("reports a generated props member iff the reference does", () => {
    const findings = lintFixtures("noAccessorProp", files);
    const wrong = cases.flatMap((c, index) => {
      const got = (findings.get(name(c, index)) ?? []).length;
      const want = Number(reported(c));
      if (got === want) return [];
      return [{ seed, index, got, want, source: source(c) }];
    });
    expect(wrong).toEqual([]);
  });
});
