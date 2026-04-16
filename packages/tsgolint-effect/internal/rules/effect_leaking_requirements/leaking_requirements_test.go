package effect_leaking_requirements

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestLeakingRequirements(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &LeakingRequirementsRule, []rule_tester.ValidTestCase{
		// Clean service — no requirements leak
		{Code: `
import { Effect } from "effect"
interface CleanService {
  readonly get: () => Effect.Effect<number>
  readonly set: (n: number) => Effect.Effect<void>
}
		`},
		// Single method — can't detect shared leaks
		{Code: `
import { Effect } from "effect"
interface DatabaseService { readonly query: (sql: string) => Effect.Effect<string> }
interface SingleMethod {
  readonly get: () => Effect.Effect<number, never, DatabaseService>
}
		`},
		// Different requirements per method — not a leak
		{Code: `
import { Effect } from "effect"
interface ServiceA { readonly a: number }
interface ServiceB { readonly b: number }
interface MixedService {
  readonly getA: () => Effect.Effect<number, never, ServiceA>
  readonly getB: () => Effect.Effect<number, never, ServiceB>
}
		`},
	}, []rule_tester.InvalidTestCase{
		// All methods leak the same requirement
		{
			Code: `
import { Effect } from "effect"
interface FileSystem { readonly readFile: (path: string) => Effect.Effect<string> }
interface LeakingService {
  readonly writeCache: () => Effect.Effect<void, never, FileSystem>
  readonly readCache: () => Effect.Effect<string, never, FileSystem>
}
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "leakingRequirements"},
			},
		},
	})
}
