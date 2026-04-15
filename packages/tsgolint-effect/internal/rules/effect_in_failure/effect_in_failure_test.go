package effect_in_failure

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestEffectInFailure(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &EffectInFailureRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
class MyError { readonly _tag = "MyError" }
const program: Effect.Effect<number, MyError> = Effect.fail(new MyError())
		`},
		{Code: `
import { Effect } from "effect"
const program = Effect.succeed(42)
		`},
	}, []rule_tester.InvalidTestCase{
		{
			Code: `
import { Effect } from "effect"
declare const bad: Effect.Effect<number, Effect.Effect<string>>
bad
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "effectInFailure"},
			},
		},
	})
}
