package effect_scope_in_layer

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestScopeInLayer(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &ScopeInLayerRule, []rule_tester.ValidTestCase{
		// Layer.scoped — not Layer.effect
		{Code: `
import { Layer, Effect, Context } from "effect"
interface MyService { readonly value: number }
const MyService = Context.GenericTag<MyService>("MyService")
const myLayer = Layer.scoped(MyService, Effect.succeed({ value: 1 }))
		`},
		// Layer.succeed — no scope involved
		{Code: `
import { Layer, Context } from "effect"
interface MyService { readonly value: number }
const MyService = Context.GenericTag<MyService>("MyService")
const myLayer = Layer.succeed(MyService, { value: 1 })
		`},
		// Layer.effect without Scope in RIn
		{Code: `
import { Layer, Effect, Context } from "effect"
interface MyService { readonly value: number }
const MyService = Context.GenericTag<MyService>("MyService")
const myLayer = Layer.effect(MyService, Effect.succeed({ value: 1 }))
		`},
	}, []rule_tester.InvalidTestCase{})
}
