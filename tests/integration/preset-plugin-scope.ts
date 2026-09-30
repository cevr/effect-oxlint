export const sorted = (values: ReadonlyArray<number>) => [...values].sort();
export function outer(values: ReadonlyArray<number>) {
  const inner = (value: number) => value + 1;
  return values.map(inner);
}
