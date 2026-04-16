// Package effect_fn_opportunity implements the effect/fn-opportunity rule.
//
// Detects functions that return an Effect type and suggests converting them
// to Effect.fn for automatic tracing. Handles arrow functions, function
// expressions, and function declarations.
//
// Does NOT trigger when:
//   - Function is a generator (function*)
//   - Function has an explicit return type annotation
//   - Function is already inside Effect.fn
//   - Function has multiple return paths
//   - Function is a concise arrow returning a non-gen expression (unless > 5 statements)
//   - Function has overloaded signatures
package effect_fn_opportunity

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var FnOpportunityRule = rule.Rule{
	Name: "effect/fn-opportunity",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindFunctionDeclaration: func(node *ast.Node) {
				fnDecl := node.AsFunctionDeclaration()
				if fnDecl.AsteriskToken != nil {
					return // generator
				}
				if fnDecl.Name() == nil {
					return
				}
				if fnDecl.Type != nil {
					return // explicit return type
				}
				if isInsideEffectFn(node) {
					return
				}
				checkFunctionReturnsEffect(ctx, node)
			},
			ast.KindArrowFunction: func(node *ast.Node) {
				arrowFn := node.AsArrowFunction()
				if arrowFn.Type != nil {
					return // explicit return type
				}
				if isInsideEffectFn(node) {
					return
				}
				// Skip concise arrows that aren't Effect.gen
				if arrowFn.Body != nil && arrowFn.Body.Kind != ast.KindBlock {
					// Concise body — only report if it's Effect.gen(...)
					if !isEffectGenCall(arrowFn.Body) {
						return
					}
				}
				// Need a name from parent context
				if getNameFromParent(node) == "" {
					return
				}
				checkFunctionReturnsEffect(ctx, node)
			},
			ast.KindFunctionExpression: func(node *ast.Node) {
				fnExpr := node.AsFunctionExpression()
				if fnExpr.AsteriskToken != nil {
					return // generator
				}
				if fnExpr.Type != nil {
					return // explicit return type
				}
				// Named function expressions can be recursive — skip
				if fnExpr.Name() != nil {
					return
				}
				if isInsideEffectFn(node) {
					return
				}
				if getNameFromParent(node) == "" {
					return
				}
				checkFunctionReturnsEffect(ctx, node)
			},
		}
	},
}

func checkFunctionReturnsEffect(ctx rule.RuleContext, node *ast.Node) {
	// Get the function type
	t := ctx.TypeChecker.GetTypeAtLocation(node)
	if t == nil {
		return
	}

	// Must have exactly one call signature (no overloads)
	sigs := checker.Checker_getSignaturesOfType(ctx.TypeChecker, t, checker.SignatureKindCall)
	if len(sigs) != 1 {
		return
	}

	returnType := checker.Checker_getReturnTypeOfSignature(ctx.TypeChecker, sigs[0])
	if returnType == nil {
		return
	}

	// Check all union members are Effect types
	parts := utils.UnionTypeParts(returnType)
	allEffect := true
	for _, part := range parts {
		if !effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, part) {
			allEffect = false
			break
		}
	}

	if !allEffect {
		return
	}

	// For block-body functions that aren't Effect.gen, require > 5 statements
	if !containsEffectGen(node) {
		stmtCount := countStatements(node)
		if stmtCount <= 5 {
			return
		}
	}

	ctx.ReportNode(node, rule.RuleMessage{
		Id:          "fnOpportunity",
		Description: "Function returns an Effect. Consider using Effect.fn for automatic tracing.",
		Help:        "Wrap this function with Effect.fn(\"name\")(function*() { ... }) for built-in span tracing.",
	})
}

func isInsideEffectFn(node *ast.Node) bool {
	current := node.Parent
	for current != nil {
		if current.Kind == ast.KindCallExpression {
			call := current.AsCallExpression()
			if call.Expression != nil {
				// Check Effect.fn(...) direct
				if call.Expression.Kind == ast.KindPropertyAccessExpression {
					propAccess := call.Expression.AsPropertyAccessExpression()
					nameNode := propAccess.Name()
					if nameNode != nil && nameNode.Kind == ast.KindIdentifier {
						name := nameNode.AsIdentifier().Text
						if (name == "fn" || name == "fnUntraced") &&
							propAccess.Expression != nil &&
							propAccess.Expression.Kind == ast.KindIdentifier &&
							propAccess.Expression.AsIdentifier().Text == "Effect" {
							return true
						}
					}
				}
				// Check Effect.fn("name")(...) — callee is itself a call
				if call.Expression.Kind == ast.KindCallExpression {
					innerCall := call.Expression.AsCallExpression()
					if innerCall.Expression != nil && innerCall.Expression.Kind == ast.KindPropertyAccessExpression {
						propAccess := innerCall.Expression.AsPropertyAccessExpression()
						nameNode := propAccess.Name()
						if nameNode != nil && nameNode.Kind == ast.KindIdentifier {
							name := nameNode.AsIdentifier().Text
							if (name == "fn" || name == "fnUntraced") &&
								propAccess.Expression != nil &&
								propAccess.Expression.Kind == ast.KindIdentifier &&
								propAccess.Expression.AsIdentifier().Text == "Effect" {
								return true
							}
						}
					}
				}
			}
		}
		current = current.Parent
	}
	return false
}

func isEffectGenCall(node *ast.Node) bool {
	if node == nil || node.Kind != ast.KindCallExpression {
		return false
	}
	call := node.AsCallExpression()
	if call.Expression == nil || call.Expression.Kind != ast.KindPropertyAccessExpression {
		return false
	}
	propAccess := call.Expression.AsPropertyAccessExpression()
	nameNode := propAccess.Name()
	if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
		return false
	}
	if nameNode.AsIdentifier().Text != "gen" {
		return false
	}
	return propAccess.Expression != nil &&
		propAccess.Expression.Kind == ast.KindIdentifier &&
		propAccess.Expression.AsIdentifier().Text == "Effect"
}

func containsEffectGen(node *ast.Node) bool {
	var body *ast.Node
	switch node.Kind {
	case ast.KindFunctionDeclaration:
		body = node.AsFunctionDeclaration().Body
	case ast.KindArrowFunction:
		body = node.AsArrowFunction().Body
	case ast.KindFunctionExpression:
		body = node.AsFunctionExpression().Body
	}
	if body == nil {
		return false
	}
	// Concise arrow body
	if body.Kind != ast.KindBlock {
		return isEffectGenCall(body)
	}
	// Block body — check if there's a return Effect.gen(...)
	block := body.AsBlock()
	for _, stmt := range block.Statements.Nodes {
		if stmt.Kind == ast.KindReturnStatement {
			ret := stmt.AsReturnStatement()
			if ret.Expression != nil && isEffectGenCall(ret.Expression) {
				return true
			}
		}
	}
	return false
}

func countStatements(node *ast.Node) int {
	var body *ast.Node
	switch node.Kind {
	case ast.KindFunctionDeclaration:
		body = node.AsFunctionDeclaration().Body
	case ast.KindArrowFunction:
		body = node.AsArrowFunction().Body
	case ast.KindFunctionExpression:
		body = node.AsFunctionExpression().Body
	}
	if body == nil || body.Kind != ast.KindBlock {
		return 0
	}
	return len(body.AsBlock().Statements.Nodes)
}

func getNameFromParent(node *ast.Node) string {
	parent := node.Parent
	if parent == nil {
		return ""
	}
	switch parent.Kind {
	case ast.KindVariableDeclaration:
		varDecl := parent.AsVariableDeclaration()
		name := varDecl.Name()
		if name != nil && name.Kind == ast.KindIdentifier {
			return name.AsIdentifier().Text
		}
	case ast.KindPropertyAssignment:
		propAssign := parent.AsPropertyAssignment()
		name := propAssign.Name()
		if name != nil && name.Kind == ast.KindIdentifier {
			return name.AsIdentifier().Text
		}
	case ast.KindPropertyDeclaration:
		propDecl := parent.AsPropertyDeclaration()
		name := propDecl.Name()
		if name != nil && name.Kind == ast.KindIdentifier {
			return name.AsIdentifier().Text
		}
	}
	return ""
}
