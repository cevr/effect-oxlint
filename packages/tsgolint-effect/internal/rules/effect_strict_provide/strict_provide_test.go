package effect_strict_provide

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestStrictProvide(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &StrictProvideRule, []rule_tester.ValidTestCase{
		// provide with non-Layer (Context value)
		{Code: `
import { Effect, Context } from "effect"
interface MyService { readonly value: number }
const MyService = Context.GenericTag<MyService>("MyService")
const program = Effect.provide(Effect.void, MyService.of({ value: 1 }))
		`},
		// No provide at all
		{Code: `
import { Effect } from "effect"
const program = Effect.succeed(42)
		`},
	}, []rule_tester.InvalidTestCase{
		// Effect.provide with a Layer argument
		{
			Code: `
import { Effect, Layer, Context } from "effect"
interface MyService { readonly value: number }
const MyService = Context.GenericTag<MyService>("MyService")
const myLayer = Layer.succeed(MyService, { value: 1 })
const program = Effect.provide(Effect.void, myLayer)
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "strictProvide"},
			},
		},
	})
}
