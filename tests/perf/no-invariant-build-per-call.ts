/**
 * Counted cost of `noInvariantBuildPerCall`: the formatters built to format n
 * prices, per call against once. Counts work, never time. Measured (bite-lab
 * BL-PERF bench, instructions per call under bun 1.4.4 and node 24.11.1):
 * see the rule's README row.
 */
export interface Cost {
  readonly built: number;
  readonly text: ReadonlyArray<string>;
}

const prices = (n: number) => Array.from({ length: n }, (_, i) => 1.5 + i * 0.37);

/** A NumberFormat that counts its constructions. */
const counting = () => {
  let built = 0;
  class Counted extends Intl.NumberFormat {
    constructor(...args: ConstructorParameters<typeof Intl.NumberFormat>) {
      super(...args);
      built += 1;
    }
  }
  return { Counted, built: () => built };
};

/** The reported form: a formatter built inside the function, on every call. */
export const perCall = (n: number): Cost => {
  const { Counted, built } = counting();
  const show = (price: number) =>
    new Counted("en-US", { style: "currency", currency: "USD" }).format(price);
  const text = prices(n).map(show);
  return { built: built(), text };
};

/** The remedy: one formatter, built once outside the function. */
export const once = (n: number): Cost => {
  const { Counted, built } = counting();
  const money = new Counted("en-US", { style: "currency", currency: "USD" });
  const show = (price: number) => money.format(price);
  const text = prices(n).map(show);
  return { built: built(), text };
};
