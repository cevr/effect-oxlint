import { createHmac } from "node:crypto";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const crypto = {
  randomUUID: () => "fixture-id",
};

export const validProgram = Effect.gen(function* () {
  const moduleNamespace = yield* Effect.tryPromise(() => import("./lazy-module.js"));
  if (Option.isSome(Option.some(moduleNamespace.value))) {
    yield* Effect.log(crypto.randomUUID());
  }
  yield* Effect.as(Effect.void, createHmac("sha256", "fixture"));
  return yield* Effect.die(new Error("explicit fixture defect"));
});
