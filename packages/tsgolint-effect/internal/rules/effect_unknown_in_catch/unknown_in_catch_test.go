package effect_unknown_in_catch

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestUnknownInCatch(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &UnknownInCatchRule, []rule_tester.ValidTestCase{
		// Typed error in catch callback
		{Code: `
import { Effect } from "effect"
class MyError { readonly _tag = "MyError"; constructor(readonly cause: unknown) {} }
const program = Effect.tryPromise({
  try: () => Promise.resolve(42),
  catch: (e) => new MyError(e)
})
		`},
		// Not a try method
		{Code: `
import { Effect } from "effect"
const program = Effect.succeed(42)
		`},
	}, []rule_tester.InvalidTestCase{
		// catch returns the error directly (unknown)
		{
			Code: `
import { Effect } from "effect"
const program = Effect.tryPromise({
  try: () => Promise.resolve(42),
  catch: (e) => e
})
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "unknownInCatch"},
			},
		},
	})
}
