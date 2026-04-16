package effect_missing_effect_context

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestMissingEffectContext(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &MissingEffectContextRule, []rule_tester.ValidTestCase{
		// No requirements — succeed is Effect<number, never, never>
		{Code: `
import { Effect } from "effect"
const program: Effect.Effect<number> = Effect.succeed(42)
		`},
		// gen with no service deps
		{Code: `
import { Effect } from "effect"
const program: Effect.Effect<number> = Effect.gen(function*() {
  return 42
})
		`},
		// Correctly declared requirements
		{Code: `
import { Effect, Context } from "effect"
interface Db { readonly query: (sql: string) => Effect.Effect<string> }
const Db = Context.GenericTag<Db>("Db")
declare const withDb: Effect.Effect<number, never, Db>
const ok: Effect.Effect<number, never, Db> = withDb
		`},
	}, []rule_tester.InvalidTestCase{
		// Missing all services in plain assignment
		{
			Code: `
import { Effect, Context } from "effect"
interface ServiceA { readonly a: number }
const ServiceA = Context.GenericTag<ServiceA>("ServiceA")
declare const effectWithServices: Effect.Effect<number, never, ServiceA>
const missing: Effect.Effect<number> = effectWithServices
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "missingEffectContext"},
			},
		},
		// Missing one service when others are declared
		{
			Code: `
import { Effect, Context } from "effect"
interface ServiceA { readonly a: number }
const ServiceA = Context.GenericTag<ServiceA>("ServiceA")
interface ServiceB { readonly b: number }
const ServiceB = Context.GenericTag<ServiceB>("ServiceB")
declare const effectWithServices: Effect.Effect<number, never, ServiceA | ServiceB>
const missing: Effect.Effect<number, never, ServiceA> = effectWithServices
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "missingEffectContext"},
			},
		},
	})
}
