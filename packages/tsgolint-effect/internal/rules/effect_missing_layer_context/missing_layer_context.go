// Package effect_missing_layer_context implements the effect/missing-layer-context rule.
//
// Detects when a Layer value has input requirements (RIn channel) that are not
// declared in the expected type. This means the layer depends on services
// that won't be provided at composition time.
package effect_missing_layer_context

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var MissingLayerContextRule = rule.Rule{
	Name: "effect/missing-layer-context",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindReturnStatement: func(node *ast.Node) {
				returnStmt := node.AsReturnStatement()
				if returnStmt.Expression == nil {
					return
				}
				checkMissingLayerContext(ctx, node, returnStmt.Expression)
			},
			ast.KindVariableDeclaration: func(node *ast.Node) {
				varDecl := node.AsVariableDeclaration()
				if varDecl.Initializer == nil || varDecl.Type == nil {
					return
				}
				checkMissingLayerContext(ctx, node, varDecl.Initializer)
			},
		}
	},
}

func checkMissingLayerContext(ctx rule.RuleContext, reportNode *ast.Node, valueNode *ast.Node) {
	realType := ctx.TypeChecker.GetTypeAtLocation(valueNode)
	if realType == nil || !effectutils.IsLayerType(ctx.Program, ctx.TypeChecker, realType) {
		return
	}

	expectedType := checker.Checker_getContextualType(ctx.TypeChecker, valueNode, 0)
	if expectedType == nil || !effectutils.IsLayerType(ctx.Program, ctx.TypeChecker, expectedType) {
		return
	}

	if realType == expectedType {
		return
	}

	_, _, realRIn := effectutils.GetLayerChannels(ctx.Program, ctx.TypeChecker, realType)
	_, _, expectedRIn := effectutils.GetLayerChannels(ctx.Program, ctx.TypeChecker, expectedType)
	if realRIn == nil || expectedRIn == nil {
		return
	}

	if effectutils.IsNeverType(expectedRIn) {
		realParts := utils.UnionTypeParts(realRIn)
		var nonNever []*checker.Type
		for _, p := range realParts {
			if !effectutils.IsNeverType(p) {
				nonNever = append(nonNever, p)
			}
		}
		if len(nonNever) > 0 {
			names := typeNames(ctx, nonNever)
			ctx.ReportNode(reportNode, rule.RuleMessage{
				Id:          "missingLayerContext",
				Description: fmt.Sprintf("Missing layer dependencies: %s. These services are required but not declared in the Layer's RIn type.", names),
				Help:        "Add the missing dependencies to the Layer's RIn type parameter, or provide them when composing layers.",
			})
		}
		return
	}

	realParts := utils.UnionTypeParts(realRIn)
	var missing []*checker.Type
	for _, part := range realParts {
		if effectutils.IsNeverType(part) {
			continue
		}
		if !checker.Checker_isTypeAssignableTo(ctx.TypeChecker, part, expectedRIn) {
			missing = append(missing, part)
		}
	}

	if len(missing) > 0 {
		names := typeNames(ctx, missing)
		ctx.ReportNode(reportNode, rule.RuleMessage{
			Id:          "missingLayerContext",
			Description: fmt.Sprintf("Missing layer dependencies: %s. These services are required but not declared in the expected Layer type.", names),
			Help:        "Add the missing dependencies to the Layer's RIn type parameter, or provide them when composing layers.",
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
