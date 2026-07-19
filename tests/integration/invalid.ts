import * as fs from "node:fs";

import * as Effect from "effect/Effect";

export async function invalidProgram(condition: boolean) {
  try {
    await fetch("https://example.com");
    const promise = Promise.resolve(new Promise(() => undefined));
    const selected = condition ? Effect.Do : Effect.bind;
    const dynamic = import("./lazy-module.js").then((moduleNamespace) => moduleNamespace.value);
    console.log(Date.now(), Math.random(), crypto.randomUUID(), Bun.file("fixture"));
    if (fs.existsSync("fixture")) {
      throw new Error("expected failure");
    }
    return [promise, selected, dynamic];
  } finally {
    Effect.log("cleanup");
  }
}

export const nativeFailure = Effect.fail(new Error("typed channel"));
