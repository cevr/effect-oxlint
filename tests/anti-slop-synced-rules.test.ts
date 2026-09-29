import { describe, expect, test } from "bun:test";

import { lintCases } from "./support/lint-fixtures.js";

// Cases ported from each rule's upstream test in dmmulroy/anti-slop at c44ef22.
describe("anti-slop rules synced from upstream", () => {
  test("noArrayFilterMap", () => {
    const results = lintCases("noArrayFilterMap", {
      valid: [
        "const users = []; users.values().filter(active).map(email).toArray();",
        "const users = []; users.values().map(email).filter(Boolean).toArray();",
        "Iterator.from(users).filter(active).map(email).toArray();",
        "function collect(users: IteratorObject<User>) { return users.filter(active).map(email).toArray(); }",
        "const users = []; users.flatMap(user => user.active ? [user.email] : []);",
        "const users = []; users.map(email); users.filter(active);",
        "const users = []; users.map(email).map(normalize);",
        "const users = []; users.filter(active).filter(verified);",
        "const custom = { filter() { return this; }, map() {} }; custom.filter(active).map(email);",
        "function collect(unknownReceiver) { return unknownReceiver.filter(active).map(email); }",
        "const users = fetchUsers(); users.filter(active).map(email);",
        "const users = []; function collect(users) { return users.filter(active).map(email); }",
        "let users = []; users = iterator; users.filter(active).map(email);",
        "const users = []; users[method](active).map(email);",
        "const first = second; const second = first; first.filter(active).map(email);",
      ],
      invalid: [
        "[].filter(active).map(email);",
        "[].map(user => user.active ? user.email : undefined).filter(email => email !== undefined);",
        "const users = []; users.map(email).filter(Boolean);",
        "const users = []; const alias = users; alias.filter(active).map(email);",
        "function collect(users: User[]) { return users.filter(active).map(email); }",
        "function collect(users: readonly User[]) { return users.map(email).filter(present); }",
        "function collect(users: ReadonlyArray<User>) { return users.filter(active).map(email); }",
        "function collect(users: Array<User>) { return users.filter(active).map(email); }",
        "const users = [] as const; users['filter'](active)['map'](email);",
        "const users = []; (users.filter(active)!).map(email);",
        "const users = []; users?.filter(active)?.map(email);",
        "const users = []; users.slice().filter(active).map(email);",
        "const users = []; users.filter(active).map(email).filter(Boolean);",
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noReduceAccumulatorCopy", () => {
    const results = lintCases("noReduceAccumulatorCopy", {
      valid: [
        "items.reduce((acc, item) => { acc.push(item); return acc; }, []);",
        "items.reduce((acc, item) => Object.assign(acc, item), {});",
        "items.reduce((acc, item) => Object.assign(acc, acc, item), {});",
        "items.reduce((acc, item) => { acc[item.id] = { ...item }; return acc; }, {});",
        "items.reduce((acc, item) => { acc.push(Object.assign({}, item)); return acc; }, []);",
        "items.reduce((acc, item) => { acc.push(item.slice()); return acc; }, []);",
        "items.reduce((acc, item) => acc.concat(item), '');",
        "items.reduce((acc, item) => acc.concat(item), customCollection);",
        "function copy(acc) { return Object.assign({}, acc); }",
        "items.map((acc, item) => Object.assign({}, acc));",
        "items.reduce((acc, item) => { function copy(acc) { return Object.assign({}, acc); } return acc; }, {});",
        "items.reduce((acc, item) => { const snapshot = () => Object.assign({}, acc); return acc; }, {});",
        "items.reduce((acc, item) => { { const acc = {}; Object.assign({}, acc); } return acc; }, {});",
        "const Object = custom; items.reduce((acc, item) => Object.assign({}, acc), {});",
        "function run(Object) { return items.reduce((acc, item) => Object.assign({}, acc), {}); }",
        "const Array = custom; items.reduce((acc, item) => Array.from(acc), []);",
        "items.reduce((acc, item) => { let alias = acc; alias = item; return Object.assign({}, alias); }, {});",
        "items.reduce((acc, item) => [...acc, item], []);",
        "items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});",
      ],
      invalid: [
        "items.reduce((acc, item) => Object.assign({}, acc, { [item.id]: item }), {});",
        "items.reduceRight((acc, item) => Object.assign({}, acc, item), {});",
        "items.reduce((acc, item, index, array) => Object.assign({}, acc, item), {});",
        "items.reduce(acc => Object.assign({}, acc), {});",
        "items.reduce(function (acc, item) { return Object.assign({}, item, acc); }, {});",
        "items['reduce'](((acc, item) => Object['assign']({}, acc, item)), {});",
        "items.reduce((acc = {}, item) => Object.assign({}, acc, item), {});",
        "items.reduce((acc, item) => { const alias = acc; return Object.assign({}, alias, item); }, {});",
        "items.reduce((acc, item) => Object.assign({}, acc as State, item), {});",
        "items.reduce((acc, item) => { const next = Object.assign({}, acc); next[item.id] = item; return next; }, {});",
        "items.reduce((acc, item) => acc.concat([item]), []);",
        "items.reduceRight((acc, item, index) => acc['concat']([item]), [] as Item[]);",
        "items.reduce((acc, item) => { const next = acc.slice(); next.push(item); return next; }, []);",
        "items.reduce((acc, item) => { const alias = acc; return alias.concat(item); }, []);",
        "const initial = []; items.reduce((acc, item) => acc.concat(item), initial);",
        "items.reduce((acc, item) => { const next = Array.from(acc); next.push(item); return next; }, []);",
        "items.reduce((acc, item) => acc.toSpliced(acc.length, 0, item), []);",
        "items.reduce((acc, item) => acc.toSorted(), []);",
        "items.reduce((acc, item) => acc.toReversed(), []);",
        "items.reduce((acc, item) => acc.with(0, item), []);",
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noReflectApply", () => {
    const results = lintCases("noReflectApply", {
      valid: [
        "const value = operation.apply(owner, args);",
        "Reflect.get(owner, key);",
        "const Reflect = { apply() { return 1; } }; Reflect.apply();",
        "function invoke(Reflect: { apply(): number }) { return Reflect.apply(); }",
      ],
      invalid: [
        "const value = Reflect.apply(operation, owner, args);",
        "const value = Reflect['apply'](operation, owner, args);",
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noReflectGet", () => {
    const results = lintCases("noReflectGet", {
      valid: [
        "const value = owner.property;",
        "const value = owner[key];",
        "Reflect.set(owner, key, value);",
        "const Reflect = { get() { return 1; } }; Reflect.get();",
        "function read(Reflect: { get(): number }) { return Reflect.get(); }",
      ],
      invalid: [
        "const value = Reflect.get(owner, key);",
        "const value = Reflect['get'](owner, key);",
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noUnknownReturns", () => {
    const results = lintCases("noUnknownReturns", {
      valid: [
        "type ImportedValue = unknown;",
        "function parse(): ImportedValue { return input; }",
        "function parse(): User { return user; }",
        "function infer() { return input; }",
        "function generic<Value>(): Value { return value; }",
        "type Value = unknown; function generic<Value>(): Value { return value; }",
        "type Key = unknown; type Mapped<Input> = { [Key in keyof Input]: () => Key };",
        "type Item = unknown; type Unpacked<Input> = Input extends Promise<infer Item> ? () => Item : never;",
        "function cause(): { cause: unknown } { return { cause: input }; }",
        "type Result = { value: unknown }; function load(): Result { return result; }",
        "function load(): Promise<User> { return promise; }",
        "type Identity<T> = T; function load(): Identity<User> { return user; }",
        "type Value = unknown; function outer() { type Value = User; function load(): Value { return user; } }",
      ],
      invalid: [
        "function load(): unknown { return input; }",
        "const load = (): unknown => input;",
        "type Loader = () => unknown;",
        "interface Loader { load(): unknown }",
        "declare function load(): unknown;",
        "function load(): string | unknown { return input; }",
        "function load(): Promise<unknown> { return promise; }",
        "type UnknownValue = unknown; function load(): UnknownValue { return input; }",
        "type Item = unknown; type Fallback<Input> = Input extends infer Item ? string : () => Item;",
        "function outer() { type Result = unknown; function load(): Result { return input; } }",
        "type Identity<T> = T; function load(): Identity<unknown> { return input; }",
        "type Identity<T> = T; type Wrapped<T> = Promise<Identity<T>>; function load(): Wrapped<unknown> { return promise; }",
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });

  test("noUnknownReturns ignores function types used as type patterns", () => {
    const results = lintCases("noUnknownReturns", {
      valid: [
        "export type Handled<H> = H extends (node: infer N) => unknown ? N : never;",
        "export function call<F extends (...args: never[]) => unknown>(operation: F): F { return operation; }",
        "export type Loaders<T extends { load(): unknown }> = T;",
      ],
      invalid: [
        "export type Handled<H> = H extends string ? () => unknown : never;",
        "export function call<F extends () => void>(operation: F): () => unknown { return operation; }",
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
});
