// Probes for each claim guard-rules.md makes about noGlobals (default options).
declare const createClient: (options: unknown) => unknown;
declare class Client {
  constructor(options: unknown);
}
declare const take: (value: unknown) => unknown;
declare const Reference: (options: unknown) => unknown;
declare const mine: unknown;

// C1 hops: reported (claim).
parent.fetch("/a");
document.defaultView?.setTimeout(() => {}, 1);
globalThis.window.fetch("/b");
window.top?.fetch("/c");

// C2 holds the walk cannot follow: reported as a use (claim).
export const h1 = { w: window };
export const h2 = [document];
export const h3 = () => performance;
export const h4 = mine ?? globalThis;
export function h5() {
  return window;
}

// C3 handed to a call or new: allowed (claim).
createClient({ fetch });
new Client({ fetch });
take([window]);
Reference({ defaultValue: () => globalThis.fetch });
take(fetch);
