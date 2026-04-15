package effect_floating_effect

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestFloatingEffect(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &FloatingEffectRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
const program = Effect.gen(function* () {
  const x = yield* Effect.succeed(42)
  return x
})
		`},
		{Code: `
import { Effect } from "effect"
const x = Effect.succeed(42)
		`},
		{Code: `
import { Effect } from "effect"
export const run = () => Effect.runPromise(Effect.succeed(42))
		`},
	}, []rule_tester.InvalidTestCase{
		{
			Code: `
import { Effect } from "effect"
Effect.sync(() => 1)
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "floatingEffect"},
			},
		},
		{
			Code: `
import { Effect } from "effect"
Effect.succeed(42)
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "floatingEffect"},
			},
		},
	})
}
