// Package effect_in_failure implements the effect/effect-in-failure rule.
//
// Detects Effect types appearing in the E (error) channel of another Effect.
// This usually indicates a programming mistake where an Effect was used
// where an error type was expected.
package effect_in_failure

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var EffectInFailureRule = rule.Rule{
	Name: "effect/effect-in-failure",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindExpressionStatement: func(node *ast.Node) {
				expr := node.AsExpressionStatement().Expression
				if expr == nil {
					return
				}
				t := ctx.TypeChecker.GetTypeAtLocation(expr)
				checkEffectInFailure(ctx, node, t)
			},
			ast.KindVariableDeclaration: func(node *ast.Node) {
				varDecl := node.AsVariableDeclaration()
				if varDecl.Initializer == nil {
					return
				}
				t := ctx.TypeChecker.GetTypeAtLocation(varDecl.Initializer)
				checkEffectInFailure(ctx, node, t)
			},
			ast.KindReturnStatement: func(node *ast.Node) {
				returnStmt := node.AsReturnStatement()
				if returnStmt.Expression == nil {
					return
				}
				t := ctx.TypeChecker.GetTypeAtLocation(returnStmt.Expression)
				checkEffectInFailure(ctx, node, t)
			},
		}
	},
}

func checkEffectInFailure(ctx rule.RuleContext, node *ast.Node, t *checker.Type) {
	errType := effectutils.GetEffectErrorChannel(ctx.Program, ctx.TypeChecker, t)
	if errType == nil {
		return
	}
	// Check if the error channel itself contains an Effect type
	parts := utils.UnionTypeParts(errType)
	for _, part := range parts {
		if effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, part) {
			ctx.ReportNode(node, rule.RuleMessage{
				Id:          "effectInFailure",
				Description: "Effect type found in the error channel. The error channel should contain error types, not Effects.",
				Help:        "Check if you accidentally passed an Effect where an error type was expected.",
			})
			return
		}
	}
}
