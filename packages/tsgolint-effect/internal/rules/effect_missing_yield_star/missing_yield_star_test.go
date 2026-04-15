package effect_missing_yield_star

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestMissingYieldStar(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &MissingYieldStarRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
const program = Effect.gen(function* () {
  const x = yield* Effect.succeed(42)
  return x
})
		`},
		{Code: `
function* normalGenerator() {
  yield 42
}
		`},
	}, []rule_tester.InvalidTestCase{
		{
			Code: `
import { Effect } from "effect"
const program = Effect.gen(function* () {
  const x = yield Effect.succeed(42)
  return x
})
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "missingYieldStar"},
			},
		},
	})
}
