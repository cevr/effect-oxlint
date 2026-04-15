// Package effect_effect_in_void_success implements the effect/effect-in-void-success rule.
//
// Detects when an Effect<Effect<...>> is expected to have a void A channel.
// This usually means a nested Effect that should have been yield*'d.
package effect_effect_in_void_success

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var EffectInVoidSuccessRule = rule.Rule{
	Name: "effect/effect-in-void-success",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindYieldExpression: func(node *ast.Node) {
				yieldExpr := node.AsYieldExpression()
				if yieldExpr.AsteriskToken == nil {
					return // non-delegating yields handled by missing-yield-star
				}
				if yieldExpr.Expression == nil {
					return
				}
				if !effectutils.IsInsideEffectGen(node) {
					return
				}
				// Get the type of the yielded expression
				t := ctx.TypeChecker.GetTypeAtLocation(yieldExpr.Expression)
				if !effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, t) {
					return
				}
				// Get the A (success) channel
				args := checker.Checker_getTypeArguments(ctx.TypeChecker, t)
				if len(args) < 1 {
					return
				}
				successType := args[0]
				// Check if A is itself an Effect type
				if effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, successType) {
					ctx.ReportNode(node, rule.RuleMessage{
						Id:          "effectInVoidSuccess",
						Description: "yield* produces an Effect value that is not being used. The inner Effect won't execute.",
						Help:        "The success channel contains an Effect. You may need another yield* to execute it.",
					})
				}
			},
		}
	},
}
