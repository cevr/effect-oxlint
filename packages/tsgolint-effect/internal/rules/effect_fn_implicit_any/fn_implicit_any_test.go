package effect_fn_implicit_any

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestFnImplicitAny(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &FnImplicitAnyRule, []rule_tester.ValidTestCase{
		// Typed parameters — valid
		{Code: `
import { Effect } from "effect"
const getUser = Effect.fn("getUser")(function*(id: string) {
  return id
})
		`},
		// No parameters — valid
		{Code: `
import { Effect } from "effect"
const program = Effect.fn("program")(function*() {
  return 42
})
		`},
		// Parameter with default value — valid
		{Code: `
import { Effect } from "effect"
const program = Effect.fn("program")(function*(n = 42) {
  return n
})
		`},
	}, []rule_tester.InvalidTestCase{
		// Untyped parameter in Effect.fn
		{
			Code: `
import { Effect } from "effect"
const getUser = Effect.fn("getUser")(function*(id) {
  return id
})
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "fnImplicitAny"},
			},
		},
	})
}
