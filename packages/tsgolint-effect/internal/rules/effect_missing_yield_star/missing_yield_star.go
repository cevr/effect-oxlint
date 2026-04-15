package effect_missing_yield_star

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var MissingYieldStarRule = rule.Rule{
	Name: "effect/missing-yield-star",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindYieldExpression: func(node *ast.Node) {
				yieldExpr := node.AsYieldExpression()
				if yieldExpr.AsteriskToken != nil {
					return
				}
				if !effectutils.IsInsideEffectGen(node) {
					return
				}
				if yieldExpr.Expression == nil {
					return
				}
				t := ctx.TypeChecker.GetTypeAtLocation(yieldExpr.Expression)
				if effectutils.IsEffectLikeType(ctx.Program, ctx.TypeChecker, t) {
					ctx.ReportNode(node, rule.RuleMessage{
						Id:          "missingYieldStar",
						Description: "Missing `*` in yield expression. Use `yield*` to execute the Effect.",
						Help:        "Change `yield` to `yield*` to properly execute the Effect and get its result.",
					})
				}
			},
		}
	},
}
