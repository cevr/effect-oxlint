// Package effect_missing_effect_error implements the effect/missing-effect-error rule.
//
// Detects when an Effect value has error types (E channel) that are not declared
// in the expected type. This means errors can be thrown but are not tracked
// in the type signature.
package effect_missing_effect_error

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var MissingEffectErrorRule = rule.Rule{
	Name: "effect/missing-effect-error",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindYieldExpression: func(node *ast.Node) {
				yieldExpr := node.AsYieldExpression()
				if yieldExpr.Expression == nil {
					return
				}
				if !effectutils.IsInsideEffectGen(node) {
					return
				}
				checkMissingError(ctx, node, yieldExpr.Expression)
			},
			ast.KindReturnStatement: func(node *ast.Node) {
				returnStmt := node.AsReturnStatement()
				if returnStmt.Expression == nil {
					return
				}
				checkMissingError(ctx, node, returnStmt.Expression)
			},
			ast.KindVariableDeclaration: func(node *ast.Node) {
				varDecl := node.AsVariableDeclaration()
				if varDecl.Initializer == nil || varDecl.Type == nil {
					return
				}
				checkMissingError(ctx, node, varDecl.Initializer)
			},
		}
	},
}

func checkMissingError(ctx rule.RuleContext, reportNode *ast.Node, valueNode *ast.Node) {
	realType := ctx.TypeChecker.GetTypeAtLocation(valueNode)
	if realType == nil || !effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, realType) {
		return
	}

	expectedType := checker.Checker_getContextualType(ctx.TypeChecker, valueNode, 0)
	if expectedType == nil || !effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, expectedType) {
		return
	}

	if realType == expectedType {
		return
	}

	realE := effectutils.GetEffectErrorChannel(ctx.Program, ctx.TypeChecker, realType)
	expectedE := effectutils.GetEffectErrorChannel(ctx.Program, ctx.TypeChecker, expectedType)
	if realE == nil || expectedE == nil {
		return
	}

	// If expected E is `never`, any real error is missing
	if effectutils.IsNeverType(expectedE) {
		realParts := utils.UnionTypeParts(realE)
		var nonNever []*checker.Type
		for _, p := range realParts {
			if !effectutils.IsNeverType(p) {
				nonNever = append(nonNever, p)
			}
		}
		if len(nonNever) > 0 {
			names := typeNames(ctx, nonNever)
			ctx.ReportNode(reportNode, rule.RuleMessage{
				Id:          "missingEffectError",
				Description: fmt.Sprintf("Unhandled error types: %s. These errors can occur but are not declared in the type.", names),
				Help:        "Add the missing error types to the Effect's E type parameter, or handle them with .catch*().",
			})
		}
		return
	}

	// Check each real E part
	realParts := utils.UnionTypeParts(realE)
	var missing []*checker.Type
	for _, part := range realParts {
		if effectutils.IsNeverType(part) {
			continue
		}
		if !checker.Checker_isTypeAssignableTo(ctx.TypeChecker, part, expectedE) {
			missing = append(missing, part)
		}
	}

	if len(missing) > 0 {
		names := typeNames(ctx, missing)
		ctx.ReportNode(reportNode, rule.RuleMessage{
			Id:          "missingEffectError",
			Description: fmt.Sprintf("Unhandled error types: %s. These errors can occur but are not declared in the expected type.", names),
			Help:        "Add the missing error types to the Effect's E type parameter, or handle them with .catch*().",
		})
	}
}

func typeNames(ctx rule.RuleContext, types []*checker.Type) string {
	names := make([]string, 0, len(types))
	for _, t := range types {
		names = append(names, effectutils.TypeToString(ctx.TypeChecker, t))
	}
	return strings.Join(names, ", ")
}
