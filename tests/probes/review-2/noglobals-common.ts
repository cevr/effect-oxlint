// Common browser and server code under noGlobals' defaults: which lines report, and is each message true?
export const isBrowser = typeof window !== "undefined";
export const hasDocument = typeof document === "object";
export const hasFetch = "fetch" in globalThis;
export const same = window === globalThis;
if (typeof window !== "undefined") window.addEventListener("resize", () => {});
export const here = new URL("/x", window.location.href);
export const wide = window.innerWidth;
export const el = document.getElementById("root");
export const self1 = globalThis.self;
export const isNode = typeof process !== "undefined" && process.versions != null;
export const env = process.env.NODE_ENV;
declare const mount: (root: unknown, view: unknown) => void;
mount(document.body, null);
export const ctx = { window, document };
export const listener = window.matchMedia("(prefers-color-scheme: dark)");
