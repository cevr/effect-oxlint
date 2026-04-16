package effect_overridden_schema_ctor

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestOverriddenSchemaCtor(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &OverriddenSchemaCtorRule, []rule_tester.ValidTestCase{
		// No constructor override — valid
		{Code: `
import { Schema } from "effect"
class User extends Schema.Class<User>("User")({ name: Schema.String }) {}
		`},
		// Non-Schema class with constructor — valid
		{Code: `
class MyClass {
  constructor(readonly value: number) {}
}
		`},
	}, []rule_tester.InvalidTestCase{})
}
