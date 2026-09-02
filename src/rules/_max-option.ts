/**
 * Shared `{ max }` option contract for threshold rules.
 *
 * One default drives three things: the JSON schema oxlint validates
 * configuration against, the defaults oxlint merges underneath user
 * options, and the options the recommended preset publishes.
 */
import type { RuleMeta } from "@oxlint/plugins";
import * as Schema from "effect/Schema";

export const MaxOptions = Schema.UndefinedOr(
  Schema.Struct({ max: Schema.optionalKey(Schema.Number) }),
);
export type MaxOptions = typeof MaxOptions.Type;

export const maxOptionsMeta = (
  defaultMax: number,
): Pick<RuleMeta, "schema" | "defaultOptions"> & {
  readonly recommendedOptions: { readonly max: number };
} => ({
  schema: [
    {
      type: "object",
      properties: { max: { type: "integer", minimum: 0 } },
      additionalProperties: false,
    },
  ],
  defaultOptions: [{ max: defaultMax }],
  recommendedOptions: { max: defaultMax },
});

/** The configured limit, or the rule default when the harness supplies no options. */
export const resolveMax = (options: MaxOptions, defaultMax: number): number =>
  options?.max ?? defaultMax;
