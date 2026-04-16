package effect_missing_layer_context

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestMissingLayerContext(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &MissingLayerContextRule, []rule_tester.ValidTestCase{
		// Layer with no dependencies
		{Code: `
import { Layer, Effect, Context } from "effect"
interface MyService { readonly value: number }
const MyService = Context.GenericTag<MyService>("MyService")
const ok: Layer.Layer<MyService> = Layer.succeed(MyService, { value: 1 })
		`},
		// Layer with correctly declared dependencies
		{Code: `
import { Layer, Effect, Context } from "effect"
interface ServiceA { readonly a: number }
const ServiceA = Context.GenericTag<ServiceA>("ServiceA")
interface ServiceB { readonly b: number }
const ServiceB = Context.GenericTag<ServiceB>("ServiceB")
declare const layerWithDeps: Layer.Layer<ServiceA, never, ServiceB>
const ok: Layer.Layer<ServiceA, never, ServiceB> = layerWithDeps
		`},
	}, []rule_tester.InvalidTestCase{
		// Missing layer dependencies
		{
			Code: `
import { Layer, Effect, Context } from "effect"
interface ServiceA { readonly a: number }
const ServiceA = Context.GenericTag<ServiceA>("ServiceA")
interface ServiceB { readonly b: number }
const ServiceB = Context.GenericTag<ServiceB>("ServiceB")
declare const layerWithDeps: Layer.Layer<ServiceA, never, ServiceB>
const missing: Layer.Layer<ServiceA> = layerWithDeps
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "missingLayerContext"},
			},
		},
	})
}
