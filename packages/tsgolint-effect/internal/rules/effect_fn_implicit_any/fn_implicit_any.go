// Package effect_fn_implicit_any implements the effect/fn-implicit-any rule.
//
// Detects Effect.fn callbacks where parameters have implicit `any` type
// because neither a type annotation nor contextual typing provides a type.
package effect_fn_implicit_any

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
)

var FnImplicitAnyRule = rule.Rule{
	Name: "effect/fn-implicit-any",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindCallExpression: func(node *ast.Node) {
				call := node.AsCallExpression()
				if call.Expression == nil {
					return
				}

				// Match two patterns:
				// 1. Effect.fn("name")(callback) — callee is a CallExpression
				// 2. Effect.fn(callback) — callee is PropertyAccessExpression
				var fnArgs []*ast.Node

				if call.Expression.Kind == ast.KindCallExpression {
					// Pattern: Effect.fn("name")(callback)
					innerCall := call.Expression.AsCallExpression()
					if !isEffectFnCall(innerCall) {
						return
					}
					fnArgs = call.Arguments.Nodes
				} else if isEffectFnCallNode(call) {
					// Pattern: Effect.fn(callback) — single arg form
					fnArgs = call.Arguments.Nodes
				} else {
					return
				}

				// Check if there's an outer contextual type providing parameter types
				outerCtx := checker.Checker_getContextualType(ctx.TypeChecker, node, 0)
				if outerCtx != nil {
					sigs := checker.Checker_getSignaturesOfType(ctx.TypeChecker, outerCtx, checker.SignatureKindCall)
					if len(sigs) > 0 {
						return
					}
				}

				// Find function arguments and check for untyped params
				for _, arg := range fnArgs {
					var params *ast.NodeList
					switch arg.Kind {
					case ast.KindArrowFunction:
						params = arg.AsArrowFunction().Parameters
					case ast.KindFunctionExpression:
						params = arg.AsFunctionExpression().Parameters
					default:
						continue
					}
					if params == nil {
						continue
					}

					for _, param := range params.Nodes {
						if param.Kind != ast.KindParameter {
							continue
						}
						paramDecl := param.AsParameterDeclaration()
						if paramDecl.Type != nil {
							continue
						}
						if paramDecl.Initializer != nil {
							continue
						}
						if paramDecl.DotDotDotToken != nil {
							continue
						}
						ctx.ReportNode(param, rule.RuleMessage{
							Id:          "fnImplicitAny",
							Description: "Parameter has implicit `any` type in Effect.fn callback. Add a type annotation.",
							Help:        "Add an explicit type annotation to the parameter.",
						})
					}
				}
			},
		}
	},
}

func isEffectFnCall(call *ast.CallExpression) bool {
	if call.Expression == nil || call.Expression.Kind != ast.KindPropertyAccessExpression {
		return false
	}
	propAccess := call.Expression.AsPropertyAccessExpression()
	nameNode := propAccess.Name()
	if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
		return false
	}
	name := nameNode.AsIdentifier().Text
	if name != "fn" && name != "fnUntraced" {
		return false
	}
	return propAccess.Expression != nil &&
		propAccess.Expression.Kind == ast.KindIdentifier &&
		propAccess.Expression.AsIdentifier().Text == "Effect"
}

func isEffectFnCallNode(call *ast.CallExpression) bool {
	return isEffectFnCall(call)
}
