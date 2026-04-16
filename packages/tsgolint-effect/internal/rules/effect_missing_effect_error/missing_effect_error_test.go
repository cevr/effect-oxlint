package effect_missing_effect_error

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestMissingEffectError(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &MissingEffectErrorRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
const program = Effect.succeed(42)
		`},
		{Code: `
import { Effect } from "effect"
class MyError { readonly _tag = "MyError" }
const program: Effect.Effect<number, MyError> = Effect.fail(new MyError())
		`},
	}, []rule_tester.InvalidTestCase{})
}
