package effect_catch_unfailable

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestCatchUnfailable(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &CatchUnfailableRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
class MyError { readonly _tag = "MyError" }
const failable = Effect.fail(new MyError())
const caught = Effect.catchAll(failable, () => Effect.succeed("recovered"))
		`},
		{Code: `
import { Effect } from "effect"
const x = Effect.succeed(42)
		`},
	}, []rule_tester.InvalidTestCase{
		{
			Code: `
import { Effect } from "effect"
const infallible = Effect.succeed(42)
const caught = Effect.catchAll(infallible, () => Effect.succeed("fallback"))
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "catchUnfailable"},
			},
		},
	})
}
