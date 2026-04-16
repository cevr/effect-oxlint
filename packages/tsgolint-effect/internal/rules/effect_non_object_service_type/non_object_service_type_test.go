package effect_non_object_service_type

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestNonObjectServiceType(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &NonObjectServiceTypeRule, []rule_tester.ValidTestCase{
		// Object service type — valid
		{Code: `
import { Effect, Context } from "effect"
class MyService extends Context.Service<MyService>()("MyService", { succeed: { value: 1 } }) {}
		`},
		// No succeed key
		{Code: `
import { Effect, Context } from "effect"
const MyTag = Context.GenericTag<{ value: number }>("MyTag")
		`},
	}, []rule_tester.InvalidTestCase{})
}
