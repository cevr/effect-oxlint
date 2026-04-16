// Package effect_scope_in_layer implements the effect/scope-in-layer-effect rule.
//
// Detects Layer.effect(...) calls where the resulting Layer's RIn contains
// Scope. This means the effect uses scoped resources but Layer.effect doesn't
// provide a scope — use Layer.scoped instead.
package effect_scope_in_layer

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var ScopeInLayerRule = rule.Rule{
	Name: "effect/scope-in-layer-effect",
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
				name := nameNode.AsIdentifier().Text
				// Match Layer.effect, Layer.effectContext, Layer.effectDiscard
				if name != "effect" && name != "effectContext" && name != "effectDiscard" {
					return
				}
				if propAccess.Expression == nil ||
					propAccess.Expression.Kind != ast.KindIdentifier ||
					propAccess.Expression.AsIdentifier().Text != "Layer" {
					return
				}

				// Get the type of the entire Layer.effect(...) call
				t := ctx.TypeChecker.GetTypeAtLocation(node)
				if !effectutils.IsLayerType(ctx.Program, ctx.TypeChecker, t) {
					return
				}

				_, _, rIn := effectutils.GetLayerChannels(ctx.Program, ctx.TypeChecker, t)
				if rIn == nil || effectutils.IsNeverType(rIn) {
					return
				}

				// Check if any member of RIn is Scope
				parts := utils.UnionTypeParts(rIn)
				for _, part := range parts {
					if effectutils.IsScopeType(ctx.Program, ctx.TypeChecker, part) {
						ctx.ReportNode(node, rule.RuleMessage{
							Id:          "scopeInLayerEffect",
							Description: "Layer.effect() has Scope in its requirements. Use Layer.scoped() instead to properly manage the scope lifecycle.",
							Help:        "Replace Layer.effect with Layer.scoped to automatically provide a Scope.",
						})
						return
					}
				}
			},
		}
	},
}
