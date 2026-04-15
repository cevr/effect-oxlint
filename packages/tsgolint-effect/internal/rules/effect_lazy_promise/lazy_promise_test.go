package effect_lazy_promise

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestLazyPromiseInSync(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &LazyPromiseInSyncRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect } from "effect"
const program = Effect.sync(() => 42)
		`},
		{Code: `
import { Effect } from "effect"
const program = Effect.sync(() => "hello")
		`},
		{Code: `
import { Effect } from "effect"
declare function fetchData(): Promise<string>
const program = Effect.promise(() => fetchData())
		`},
	}, []rule_tester.InvalidTestCase{
		{
			Code: `
import { Effect } from "effect"
declare function fetchData(): Promise<string>
const program = Effect.sync(() => fetchData())
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "lazyPromiseInSync"},
			},
		},
	})
}
