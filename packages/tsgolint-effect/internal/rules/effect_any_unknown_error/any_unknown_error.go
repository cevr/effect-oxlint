// Package effect_any_unknown_error implements the effect/any-unknown-in-error rule.
//
// Detects when `any` or `unknown` appears in the error (E) channel of an
// Effect or Layer type. Untyped errors defeat the purpose of Effect's
// typed error tracking.
package effect_any_unknown_error

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var AnyUnknownErrorRule = rule.Rule{
	Name: "effect/any-unknown-in-error",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindVariableDeclaration: func(node *ast.Node) {
				varDecl := node.AsVariableDeclaration()
				// Check both initializer and declared type
				if varDecl.Initializer != nil {
					checkAnyUnknownError(ctx, node, varDecl.Initializer)
				} else if varDecl.Type != nil {
					// declare const x: Effect<number, any>
					t := ctx.TypeChecker.GetTypeAtLocation(node)
					checkAnyUnknownErrorType(ctx, node, t)
				}
			},
			ast.KindExpressionStatement: func(node *ast.Node) {
				expr := node.AsExpressionStatement().Expression
				if expr == nil {
					return
				}
				checkAnyUnknownError(ctx, node, expr)
			},
			ast.KindReturnStatement: func(node *ast.Node) {
				returnStmt := node.AsReturnStatement()
				if returnStmt.Expression == nil {
					return
				}
				checkAnyUnknownError(ctx, node, returnStmt.Expression)
			},
			ast.KindCallExpression: func(node *ast.Node) {
				checkAnyUnknownError(ctx, node, node)
			},
		}
	},
}

func checkAnyUnknownErrorType(ctx rule.RuleContext, reportNode *ast.Node, t *checker.Type) {
	if t == nil {
		return
	}

	var errType *checker.Type

	if effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, t) {
		errType = effectutils.GetEffectErrorChannel(ctx.Program, ctx.TypeChecker, t)
	} else if effectutils.IsLayerType(ctx.Program, ctx.TypeChecker, t) {
		_, errType, _ = effectutils.GetLayerChannels(ctx.Program, ctx.TypeChecker, t)
	}

	if errType == nil {
		return
	}

	parts := utils.UnionTypeParts(errType)
	for _, part := range parts {
		if effectutils.IsAnyType(part) {
			ctx.ReportNode(reportNode, rule.RuleMessage{
				Id:          "anyUnknownInError",
				Description: "`any` found in the error channel. Use a specific tagged error type instead.",
				Help:        "Replace `any` with a concrete error type like Schema.TaggedErrorClass or Data.TaggedError.",
			})
			return
		}
		if effectutils.IsUnknownType(part) {
			ctx.ReportNode(reportNode, rule.RuleMessage{
				Id:          "anyUnknownInError",
				Description: "`unknown` found in the error channel. Use a specific tagged error type instead.",
				Help:        "Replace `unknown` with a concrete error type like Schema.TaggedErrorClass or Data.TaggedError.",
			})
			return
		}
	}
}

func checkAnyUnknownError(ctx rule.RuleContext, reportNode *ast.Node, valueNode *ast.Node) {
	t := ctx.TypeChecker.GetTypeAtLocation(valueNode)
	if t == nil {
		return
	}

	var errType *checker.Type

	// Try Effect first
	if effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, t) {
		errType = effectutils.GetEffectErrorChannel(ctx.Program, ctx.TypeChecker, t)
	} else if effectutils.IsLayerType(ctx.Program, ctx.TypeChecker, t) {
		_, errType, _ = effectutils.GetLayerChannels(ctx.Program, ctx.TypeChecker, t)
	}

	if errType == nil {
		return
	}

	// Check if error type contains any or unknown
	parts := utils.UnionTypeParts(errType)
	for _, part := range parts {
		if effectutils.IsAnyType(part) {
			ctx.ReportNode(reportNode, rule.RuleMessage{
				Id:          "anyUnknownInError",
				Description: "`any` found in the error channel. Use a specific tagged error type instead.",
				Help:        "Replace `any` with a concrete error type like Schema.TaggedErrorClass or Data.TaggedError.",
			})
			return
		}
		if effectutils.IsUnknownType(part) {
			ctx.ReportNode(reportNode, rule.RuleMessage{
				Id:          "anyUnknownInError",
				Description: "`unknown` found in the error channel. Use a specific tagged error type instead.",
				Help:        "Replace `unknown` with a concrete error type like Schema.TaggedErrorClass or Data.TaggedError.",
			})
			return
		}
	}
}
