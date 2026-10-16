// The effect releases a test compares: 4.0.0 (the `effect-4.0.0` alias) and the
// one these tests install. Two releases' modules are not one type (each
// declares its own Effect), so 4.0.0's are read under the installed release's
// types here, the one place that says so, and each effect runs on its own
// release's runtime.
import * as Cause400 from "effect-4.0.0/Cause";
import * as Effect400 from "effect-4.0.0/Effect";
import * as Exit400 from "effect-4.0.0/Exit";
import * as Fiber400 from "effect-4.0.0/Fiber";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";

/** One release's modules, under the installed release's types. */
export interface Release {
  readonly Effect: typeof Effect;
  readonly Exit: typeof Exit;
  readonly Fiber: typeof Fiber;
  readonly Cause: typeof Cause;
}

/** The release these tests install. */
export const installed: Release = { Effect, Exit, Fiber, Cause };

/** Effect 4.0.0. */
export const first: Release = {
  Effect: Effect400 as unknown as typeof Effect,
  Exit: Exit400 as unknown as typeof Exit,
  Fiber: Fiber400 as unknown as typeof Fiber,
  Cause: Cause400 as unknown as typeof Cause,
};

/** Runs an effect built from a release's modules on that release's runtime. */
export const runOn = <A>(release: Release, effect: Effect.Effect<A>): Promise<A> =>
  release.Effect.runPromise(effect);
