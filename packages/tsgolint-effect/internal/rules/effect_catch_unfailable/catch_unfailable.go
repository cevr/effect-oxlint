package effect_catch_unfailable

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var catchMethods = map[string]bool{
	"catchAll": true, "catch": true, "catchTag": true,
	"catchTags": true, "catchIf": true, "catchSome": true,
}

var CatchUnfailableRule = rule.Rule{
	Name: "effect/catch-unfailable",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindCallExpression: func(node *ast.Node) {
				call := node.AsCallExpression()
				if call.Expression == nil || call.Expression.Kind != ast.KindPropertyAccessExpression {
					return
				}
				propAccess := call.Expression.AsPropertyAccessExpression()
				if !catchMethods[propAccess.Name().Text()] {
					return
				}
				if propAccess.Expression == nil ||
					propAccess.Expression.Kind != ast.KindIdentifier ||
					propAccess.Expression.AsIdentifier().Text != "Effect" {
					return
				}
				args := call.Arguments.Nodes
				if len(args) < 1 {
					return
				}
				t := ctx.TypeChecker.GetTypeAtLocation(args[0])
				errType := effectutils.GetEffectErrorChannel(ctx.Program, ctx.TypeChecker, t)
				if errType != nil && effectutils.IsNeverType(errType) {
					ctx.ReportNode(node, rule.RuleMessage{
						Id:          "catchUnfailable",
						Description: "Catch handler on an infallible Effect (error channel is `never`). The handler will never run.",
						Help:        "Remove the catch handler — this Effect cannot fail.",
					})
				}
			},
		}
	},
}
