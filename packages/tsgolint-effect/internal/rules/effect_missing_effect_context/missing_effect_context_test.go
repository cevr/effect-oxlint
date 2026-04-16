package effect_missing_effect_context

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestMissingEffectContext(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &MissingEffectContextRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
const program = Effect.succeed(42)
		`},
		{Code: `
import { Effect } from "effect"
const program = Effect.gen(function*() {
  return 42
})
		`},
	}, []rule_tester.InvalidTestCase{})
}
