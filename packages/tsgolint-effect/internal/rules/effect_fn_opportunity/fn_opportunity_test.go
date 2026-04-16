package effect_fn_opportunity

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestFnOpportunity(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &FnOpportunityRule, []rule_tester.ValidTestCase{
		// Already using Effect.fn
		{Code: `
import { Effect } from "effect"
const program = Effect.fn("program")(function*() {
  return 42
})
		`},
		// Generator function — not eligible
		{Code: `
import { Effect } from "effect"
function* myGen() {
  yield 1
}
		`},
		// Plain function with <= 5 statements (too short)
		{Code: `
import { Effect } from "effect"
const short = () => Effect.succeed(42)
		`},
		// Function with explicit return type
		{Code: `
import { Effect } from "effect"
function explicit(): Effect.Effect<number> {
  return Effect.succeed(42)
}
		`},
	}, []rule_tester.InvalidTestCase{
		// Arrow function returning Effect.gen — should suggest Effect.fn
		{
			Code: `
import { Effect } from "effect"
const getUser = (id: string) => Effect.gen(function*() {
  return id
})
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "fnOpportunity"},
			},
		},
		// Function declaration returning Effect.gen
		{
			Code: `
import { Effect } from "effect"
function getUser(id: string) {
  return Effect.gen(function*() {
    return id
  })
}
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "fnOpportunity"},
			},
		},
	})
}
