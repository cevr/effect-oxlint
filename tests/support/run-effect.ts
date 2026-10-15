import * as Effect from "effect/Effect";

/**
 * A test's Promise edge for an Effect it runs against the effect this repo
 * installs: a test that holds a rule's message to effect's behaviour.
 */
export const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect);
