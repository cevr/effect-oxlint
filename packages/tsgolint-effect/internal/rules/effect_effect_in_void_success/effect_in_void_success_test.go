package effect_effect_in_void_success

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestEffectInVoidSuccess(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &EffectInVoidSuccessRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
const program = Effect.gen(function* () {
  const x = yield* Effect.succeed(42)
  return x
})
		`},
		{Code: `
import { Effect } from "effect"
const program = Effect.gen(function* () {
  yield* Effect.sync(() => console.log("side effect"))
})
		`},
	}, []rule_tester.InvalidTestCase{
		{
			Code: `
import { Effect } from "effect"
const makeEffect = () => Effect.succeed(Effect.succeed(42))
const program = Effect.gen(function* () {
  yield* makeEffect()
})
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "effectInVoidSuccess"},
			},
		},
	})
}
