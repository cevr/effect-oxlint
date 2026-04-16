package effect_unnecessary_fail_yieldable

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestUnnecessaryFailYieldable(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &UnnecessaryFailYieldableRule, []rule_tester.ValidTestCase{
		// Non-yieldable error — Effect.fail is needed
		{Code: `
import { Effect } from "effect"
class PlainError { readonly _tag = "PlainError" }
const program = Effect.gen(function*() {
  yield* Effect.fail(new PlainError())
})
		`},
		// Not inside Effect.gen
		{Code: `
import { Effect } from "effect"
const program = Effect.fail(new Error("oops"))
		`},
		// yield without star
		{Code: `
import { Effect } from "effect"
function* gen() {
  yield Effect.fail(new Error("oops"))
}
		`},
	}, []rule_tester.InvalidTestCase{})
}
