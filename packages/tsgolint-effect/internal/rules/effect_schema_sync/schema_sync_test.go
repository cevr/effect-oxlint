package effect_schema_sync

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestSchemaSyncInEffect(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &SchemaSyncInEffectRule, []rule_tester.ValidTestCase{
		{Code: `
import { Effect, Schema } from "effect"
const MySchema = Schema.Struct({ name: Schema.String })
const decode = Schema.decodeSync(MySchema)
const result = decode({ name: "hello" })
		`},
		{Code: `
import { Effect, Schema } from "effect"
const MySchema = Schema.Struct({ name: Schema.String })
const program = Effect.gen(function* () {
  const result = yield* Schema.decodeUnknown(MySchema)({ name: "hello" })
  return result
})
		`},
	}, []rule_tester.InvalidTestCase{
		{
			Code: `
import { Effect, Schema } from "effect"
const MySchema = Schema.Struct({ name: Schema.String })
const program = Effect.gen(function* () {
  const result = Schema.decodeSync(MySchema)({ name: "hello" })
  return result
})
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "schemaSyncInEffect"},
			},
		},
	})
}
