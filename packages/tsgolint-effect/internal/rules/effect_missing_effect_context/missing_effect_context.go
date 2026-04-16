// Package effect_missing_effect_context implements the effect/missing-effect-context rule.
//
// Detects when an Effect value has requirements (R channel) that are not declared
// in the expected type. This means services are being used but not listed in
// the type signature, which will cause runtime errors.
package effect_missing_effect_context

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var MissingEffectContextRule = rule.Rule{
	Name: "effect/missing-effect-context",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			// Check yield* expressions in Effect.gen
			ast.KindYieldExpression: func(node *ast.Node) {
				yieldExpr := node.AsYieldExpression()
				if yieldExpr.Expression == nil {
					return
				}
				if !effectutils.IsInsideEffectGen(node) {
					return
				}
				checkMissingContext(ctx, node, yieldExpr.Expression)
			},
			// Check return statements
			ast.KindReturnStatement: func(node *ast.Node) {
				returnStmt := node.AsReturnStatement()
				if returnStmt.Expression == nil {
					return
				}
				checkMissingContext(ctx, node, returnStmt.Expression)
			},
			// Check variable declarations with type annotations
			ast.KindVariableDeclaration: func(node *ast.Node) {
				varDecl := node.AsVariableDeclaration()
				if varDecl.Initializer == nil || varDecl.Type == nil {
					return
				}
				checkMissingContext(ctx, node, varDecl.Initializer)
			},
		}
	},
}

func checkMissingContext(ctx rule.RuleContext, reportNode *ast.Node, valueNode *ast.Node) {
	realType := ctx.TypeChecker.GetTypeAtLocation(valueNode)
	if realType == nil || !effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, realType) {
		return
	}

	// Get the expected (contextual) type
	expectedType := checker.Checker_getContextualType(ctx.TypeChecker, valueNode, 0)
	if expectedType == nil || !effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, expectedType) {
		return
	}

	// Skip if types are identical (pointer equality — fast path)
	if realType == expectedType {
		return
	}

	realR := effectutils.GetEffectContextChannel(ctx.Program, ctx.TypeChecker, realType)
	expectedR := effectutils.GetEffectContextChannel(ctx.Program, ctx.TypeChecker, expectedType)
	if realR == nil || expectedR == nil {
		return
	}

	// If expected R is already `never`, nothing is expected — check if real has requirements
	if effectutils.IsNeverType(expectedR) {
		realParts := utils.UnionTypeParts(realR)
		var nonNever []*checker.Type
		for _, p := range realParts {
			if !effectutils.IsNeverType(p) {
				nonNever = append(nonNever, p)
			}
		}
		if len(nonNever) > 0 {
			names := typeNames(ctx, nonNever)
			ctx.ReportNode(reportNode, rule.RuleMessage{
				Id:          "missingEffectContext",
				Description: fmt.Sprintf("Missing service requirements: %s. These services are used but not declared in the type.", names),
				Help:        "Add the missing services to the Effect's R type parameter, or provide them via Layer.",
			})
		}
		return
	}

	// Check each real R part to see if it's assignable to expected R
	realParts := utils.UnionTypeParts(realR)
	var missing []*checker.Type
	for _, part := range realParts {
		if effectutils.IsNeverType(part) {
			continue
		}
		if !checker.Checker_isTypeAssignableTo(ctx.TypeChecker, part, expectedR) {
			missing = append(missing, part)
		}
	}

	if len(missing) > 0 {
		names := typeNames(ctx, missing)
		ctx.ReportNode(reportNode, rule.RuleMessage{
			Id:          "missingEffectContext",
			Description: fmt.Sprintf("Missing service requirements: %s. These services are used but not declared in the expected type.", names),
			Help:        "Add the missing services to the Effect's R type parameter, or provide them via Layer.",
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
