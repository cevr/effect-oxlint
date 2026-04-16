package effect_class_self_mismatch

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestClassSelfMismatch(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &ClassSelfMismatchRule, []rule_tester.ValidTestCase{
		// Correct Self type
		{Code: `
import { Context, Effect } from "effect"
class MyService extends Context.Service<MyService>()("MyService", { succeed: { value: 1 } }) {}
		`},
		// Non-Effect class
		{Code: `
class Foo extends Array<string> {}
		`},
		// Schema class with correct Self
		{Code: `
import { Schema } from "effect"
class User extends Schema.Class<User>("User")({ name: Schema.String }) {}
		`},
	}, []rule_tester.InvalidTestCase{
		// Wrong Self type in Context.Service
		{
			Code: `
import { Context, Effect } from "effect"
class MyService extends Context.Service<WrongName>()("MyService", { succeed: { value: 1 } }) {}
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "classSelfMismatch"},
			},
		},
		// Wrong Self type in Schema.Class
		{
			Code: `
import { Schema } from "effect"
class User extends Schema.Class<Admin>("User")({ name: Schema.String }) {}
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "classSelfMismatch"},
			},
		},
	})
}
