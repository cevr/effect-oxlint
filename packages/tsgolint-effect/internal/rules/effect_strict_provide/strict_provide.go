// Package effect_strict_provide implements the effect/strict-provide rule.
//
// Warns when Effect.provide(layer) is used anywhere. Layer provision
// should only happen at application entry points, not scattered
// throughout the codebase.
package effect_strict_provide

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var StrictProvideRule = rule.Rule{
	Name: "effect/strict-provide",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindCallExpression: func(node *ast.Node) {
				call := node.AsCallExpression()
				if call.Expression == nil || call.Expression.Kind != ast.KindPropertyAccessExpression {
					return
				}
				propAccess := call.Expression.AsPropertyAccessExpression()
				nameNode := propAccess.Name()
				if nameNode == nil || nameNode.Kind != ast.KindIdentifier || nameNode.AsIdentifier().Text != "provide" {
					return
				}
				if propAccess.Expression == nil ||
					propAccess.Expression.Kind != ast.KindIdentifier ||
					propAccess.Expression.AsIdentifier().Text != "Effect" {
					return
				}

				// Check if any argument is a Layer type
				args := call.Arguments.Nodes
				for _, arg := range args {
					argType := ctx.TypeChecker.GetTypeAtLocation(arg)
					if effectutils.IsLayerType(ctx.Program, ctx.TypeChecker, argType) {
						ctx.ReportNode(node, rule.RuleMessage{
							Id:          "strictProvide",
							Description: "Effect.provide(Layer) should only be used at application entry points.",
							Help:        "Move layer provision to the entry point (e.g. main program composition) instead of inlining it here.",
						})
						return
					}
				}
			},
		}
	},
}
