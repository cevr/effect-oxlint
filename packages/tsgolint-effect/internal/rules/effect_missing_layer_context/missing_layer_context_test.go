package effect_missing_layer_context

import (
	"testing"

	"github.com/typescript-eslint/tsgolint/internal/rule_tester"
	"github.com/typescript-eslint/tsgolint/internal/rules/fixtures"
)

func TestMissingLayerContext(t *testing.T) {
	t.Parallel()
	rule_tester.RunRuleTester(fixtures.GetRootDir(), "tsconfig.effect.json", t, &MissingLayerContextRule, []rule_tester.ValidTestCase{
		{Code: `
import { Layer, Effect } from "effect"
const myLayer = Layer.succeed({} as any, {})
		`},
	}, []rule_tester.InvalidTestCase{})
}
