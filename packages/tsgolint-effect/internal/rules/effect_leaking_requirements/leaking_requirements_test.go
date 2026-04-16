package effect_leaking_requirements

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestLeakingRequirements(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &LeakingRequirementsRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
interface CleanService {
  readonly get: () => Effect.Effect<number>
  readonly set: (n: number) => Effect.Effect<void>
}
		`},
		{Code: `
import { Effect } from "effect"
// Single method — can't detect shared leaks
interface SingleMethod {
  readonly get: () => Effect.Effect<number, never, DatabaseService>
}
interface DatabaseService { readonly query: (sql: string) => Effect.Effect<string> }
		`},
	}, []rule_tester.InvalidTestCase{})
}
