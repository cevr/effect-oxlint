package effect_generic_services

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestGenericServices(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &GenericServicesRule, []rule_tester.ValidTestCase{
		// Non-generic service — valid
		{Code: `
import { Effect, Context } from "effect"
class MyService extends Context.Service<MyService>()("MyService", { succeed: { value: 1 } }) {}
		`},
		// Generic class but not extending Effect service
		{Code: `
class Container<T> extends Array<T> {}
		`},
	}, []rule_tester.InvalidTestCase{})
}
