package effect_floating_effect

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var FloatingEffectRule = rule.Rule{
	Name: "effect/floating-effect",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindExpressionStatement: func(node *ast.Node) {
				expr := node.AsExpressionStatement().Expression
				if expr == nil {
					return
				}
				if expr.Kind == ast.KindBinaryExpression {
					binExpr := expr.AsBinaryExpression()
					op := binExpr.OperatorToken.Kind
					if op == ast.KindEqualsToken ||
						op == ast.KindQuestionQuestionEqualsToken ||
						op == ast.KindAmpersandAmpersandEqualsToken ||
						op == ast.KindBarBarEqualsToken {
						return
					}
				}
				t := ctx.TypeChecker.GetTypeAtLocation(expr)
				if effectutils.IsEffectLikeType(ctx.Program, ctx.TypeChecker, t) {
					ctx.ReportNode(node, rule.RuleMessage{
						Id:          "floatingEffect",
						Description: "Effect created but never yielded or run. This effect will do nothing.",
						Help:        "Use `yield*` to execute the effect, or pipe it into a runner.",
					})
				}
			},
		}
	},
}
