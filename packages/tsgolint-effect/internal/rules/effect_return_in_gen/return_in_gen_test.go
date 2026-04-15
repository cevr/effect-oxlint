package effect_return_in_gen

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestReturnEffectInGen(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &ReturnEffectInGenRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
const program = Effect.gen(function* () {
  return yield* Effect.succeed(42)
})
		`},
		{Code: `
import { Effect } from "effect"
const program = Effect.gen(function* () {
  return 42
})
		`},
	}, []rule_tester.InvalidTestCase{
		{
			Code: `
import { Effect } from "effect"
const program = Effect.gen(function* () {
  return Effect.succeed(42)
})
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "returnEffectInGen"},
			},
		},
	})
}
