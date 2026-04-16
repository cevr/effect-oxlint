// Package effect_layer_merge_all_deps implements the effect/layer-merge-all-deps rule.
//
// Detects Layer.mergeAll(...) calls where one layer argument provides a service
// that another argument requires. Since mergeAll runs all layers in parallel,
// inter-layer dependencies won't be satisfied — use Layer.provideMerge or
// explicit composition instead.
package effect_layer_merge_all_deps

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var LayerMergeAllDepsRule = rule.Rule{
	Name: "effect/layer-merge-all-deps",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindCallExpression: func(node *ast.Node) {
				call := node.AsCallExpression()
				if call.Expression == nil || call.Expression.Kind != ast.KindPropertyAccessExpression {
					return
				}

				propAccess := call.Expression.AsPropertyAccessExpression()
				nameNode := propAccess.Name()
				if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
					return
				}
				if nameNode.AsIdentifier().Text != "mergeAll" {
					return
				}

				// Verify it's Layer.mergeAll
				if propAccess.Expression == nil ||
					propAccess.Expression.Kind != ast.KindIdentifier ||
					propAccess.Expression.AsIdentifier().Text != "Layer" {
					return
				}

				args := call.Arguments.Nodes
				if len(args) < 2 {
					return
				}

				// Collect ROut and RIn for each layer argument
				type layerInfo struct {
					argIndex int
					rOut     []*checker.Type
					rIn      *checker.Type
				}

				var layers []layerInfo
				for i, arg := range args {
					argType := ctx.TypeChecker.GetTypeAtLocation(arg)
					if argType == nil || !effectutils.IsLayerType(ctx.Program, ctx.TypeChecker, argType) {
						continue
					}

					rOut, _, rIn := effectutils.GetLayerChannels(ctx.Program, ctx.TypeChecker, argType)
					if rOut == nil {
						continue
					}

					layers = append(layers, layerInfo{
						argIndex: i,
						rOut:     utils.UnionTypeParts(rOut),
						rIn:      rIn,
					})
				}

				if len(layers) < 2 {
					return
				}

				// Check if any layer provides a service that another layer requires
				for _, consumer := range layers {
					if consumer.rIn == nil || effectutils.IsNeverType(consumer.rIn) {
						continue
					}
					for _, provider := range layers {
						if provider.argIndex == consumer.argIndex {
							continue
						}
						for _, provided := range provider.rOut {
							if effectutils.IsNeverType(provided) {
								continue
							}
							if checker.Checker_isTypeAssignableTo(ctx.TypeChecker, provided, consumer.rIn) {
								ctx.ReportNode(node, rule.RuleMessage{
									Id:          "layerMergeAllDeps",
									Description: fmt.Sprintf("Layer.mergeAll has inter-layer dependencies. Layer at position %d provides a service required by layer at position %d. mergeAll runs layers in parallel, so this dependency won't be satisfied.", provider.argIndex, consumer.argIndex),
									Help:        "Use Layer.provide or Layer.provideMerge to compose layers with dependencies, then pass the composed layer to mergeAll.",
								})
								return
							}
						}
					}
				}
			},
		}
	},
}
