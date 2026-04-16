package effect_any_unknown_error

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestAnyUnknownError(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &AnyUnknownErrorRule, []rule_tester.ValidTestCase{
		// No error — never
		{Code: `
import { Effect } from "effect"
const program = Effect.succeed(42)
		`},
		// Typed error
		{Code: `
import { Effect } from "effect"
class MyError { readonly _tag = "MyError" }
const program: Effect.Effect<number, MyError> = Effect.fail(new MyError())
		`},
	}, []rule_tester.InvalidTestCase{
		// any in error channel
		{
			Code: `
import { Effect } from "effect"
declare const program: Effect.Effect<number, any>
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "anyUnknownInError"},
			},
		},
		// unknown in error channel
		{
			Code: `
import { Effect } from "effect"
declare const program: Effect.Effect<number, unknown>
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "anyUnknownInError"},
			},
		},
	})
}
