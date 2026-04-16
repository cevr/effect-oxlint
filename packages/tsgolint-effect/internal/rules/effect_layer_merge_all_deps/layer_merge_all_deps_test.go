package effect_layer_merge_all_deps

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestLayerMergeAllDeps(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &LayerMergeAllDepsRule, []rule_tester.ValidTestCase{
		// Independent layers — no inter-dependencies
		{Code: `
import { Layer } from "effect"
declare const layerA: Layer.Layer<{ a: 1 }>
declare const layerB: Layer.Layer<{ b: 2 }>
const merged = Layer.mergeAll(layerA, layerB)
		`},
		// Single layer — nothing to check
		{Code: `
import { Layer } from "effect"
declare const layerA: Layer.Layer<{ a: 1 }>
const merged = Layer.mergeAll(layerA)
		`},
		// Layer with external deps not provided by siblings
		{Code: `
import { Layer } from "effect"
interface External { readonly x: number }
declare const layerA: Layer.Layer<{ a: 1 }>
declare const layerB: Layer.Layer<{ b: 2 }, never, External>
const merged = Layer.mergeAll(layerA, layerB)
		`},
	}, []rule_tester.InvalidTestCase{
		// Provider and consumer in same mergeAll
		{
			Code: `
import { Layer } from "effect"
declare const provider: Layer.Layer<{ db: 1 }>
declare const consumer: Layer.Layer<{ app: 1 }, never, { db: 1 }>
const merged = Layer.mergeAll(provider, consumer)
			`,
			Errors: []rule_tester.InvalidTestCaseError{
				{MessageId: "layerMergeAllDeps"},
			},
		},
	})
}
