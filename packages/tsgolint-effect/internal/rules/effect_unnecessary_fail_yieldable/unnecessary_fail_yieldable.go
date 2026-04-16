// Package effect_unnecessary_fail_yieldable implements the effect/unnecessary-fail-yieldable rule.
//
// Detects `yield* Effect.fail(err)` where `err` is already a YieldableError,
// meaning you can simply `yield* err` directly.
package effect_unnecessary_fail_yieldable

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var UnnecessaryFailYieldableRule = rule.Rule{
	Name: "effect/unnecessary-fail-yieldable",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindYieldExpression: func(node *ast.Node) {
				yieldExpr := node.AsYieldExpression()
				// Must be yield* (delegating)
				if yieldExpr.AsteriskToken == nil || yieldExpr.Expression == nil {
					return
				}
				if !effectutils.IsInsideEffectGen(node) {
					return
				}

				expr := yieldExpr.Expression
				// Must be a call expression: Effect.fail(...)
				if expr.Kind != ast.KindCallExpression {
					return
				}
				call := expr.AsCallExpression()
				if call.Expression == nil || call.Expression.Kind != ast.KindPropertyAccessExpression {
					return
				}
				propAccess := call.Expression.AsPropertyAccessExpression()
				nameNode := propAccess.Name()
				if nameNode == nil || nameNode.Kind != ast.KindIdentifier || nameNode.AsIdentifier().Text != "fail" {
					return
				}
				if propAccess.Expression == nil ||
					propAccess.Expression.Kind != ast.KindIdentifier ||
					propAccess.Expression.AsIdentifier().Text != "Effect" {
					return
				}

				// Get the argument to Effect.fail
				args := call.Arguments.Nodes
				if len(args) != 1 {
					return
				}

				argType := ctx.TypeChecker.GetTypeAtLocation(args[0])
				if effectutils.IsYieldableErrorType(ctx.Program, ctx.TypeChecker, argType) {
					ctx.ReportNode(node, rule.RuleMessage{
						Id:          "unnecessaryFailYieldable",
						Description: "Unnecessary Effect.fail() — the error is already yieldable. Use `yield* err` directly.",
						Help:        "Remove the Effect.fail() wrapper and yield the error directly.",
					})
				}
			},
		}
	},
}
