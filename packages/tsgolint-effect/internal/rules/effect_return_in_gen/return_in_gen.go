package effect_return_in_gen

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var ReturnEffectInGenRule = rule.Rule{
	Name: "effect/return-effect-in-gen",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindReturnStatement: func(node *ast.Node) {
				returnStmt := node.AsReturnStatement()
				if returnStmt.Expression == nil {
					return
				}
				if !effectutils.IsInsideEffectGen(node) {
					return
				}
				t := ctx.TypeChecker.GetTypeAtLocation(returnStmt.Expression)
				if effectutils.IsEffectLikeType(ctx.Program, ctx.TypeChecker, t) {
					ctx.ReportNode(node, rule.RuleMessage{
						Id:          "returnEffectInGen",
						Description: "Returning an Effect value from Effect.gen creates nested Effect<Effect<...>>.",
						Help:        "Use `return yield* effect` to execute the effect and return its result.",
					})
				}
			},
		}
	},
}
