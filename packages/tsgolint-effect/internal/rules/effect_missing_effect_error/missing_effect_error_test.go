package effect_missing_effect_error

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestMissingEffectError(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &MissingEffectErrorRule, []rule_tester.ValidTestCase{
		// No errors — succeed is Effect<number, never, never>
		{Code: `
import { Effect } from "effect"
const program: Effect.Effect<number> = Effect.succeed(42)
		`},
		// Correctly declared error
		{Code: `
import { Effect } from "effect"
class MyError { readonly _tag = "MyError" }
const program: Effect.Effect<number, MyError> = Effect.fail(new MyError())
		`},
		// Multiple errors all declared
		{Code: `
import { Effect } from "effect"
class ErrorA { readonly _tag = "ErrorA" }
class ErrorB { readonly _tag = "ErrorB" }
declare const effectWithErrors: Effect.Effect<number, ErrorA | ErrorB>
const ok: Effect.Effect<number, ErrorA | ErrorB> = effectWithErrors
		`},
	}, []rule_tester.InvalidTestCase{
		// Missing all errors
		{
			Code: `
import { Effect } from "effect"
class ErrorA { readonly _tag = "ErrorA" }
class ErrorB { readonly _tag = "ErrorB" }
declare const effectWithErrors: Effect.Effect<number, ErrorA | ErrorB>
const missing: Effect.Effect<number> = effectWithErrors
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "missingEffectError"},
			},
		},
		// Missing one error when others are declared
		{
			Code: `
import { Effect } from "effect"
class ErrorA { readonly _tag = "ErrorA" }
class ErrorB { readonly _tag = "ErrorB" }
class ErrorC { readonly _tag = "ErrorC" }
declare const effectWithErrors: Effect.Effect<number, ErrorA | ErrorB | ErrorC>
const missing: Effect.Effect<number, ErrorA | ErrorB> = effectWithErrors
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "missingEffectError"},
			},
		},
	})
}
