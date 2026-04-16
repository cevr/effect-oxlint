// Package effect_unknown_in_catch implements the effect/unknown-in-effect-catch rule.
//
// Detects Effect.tryPromise/Effect.try calls where the `catch` callback
// returns `unknown` or `any`, meaning the error channel remains untyped.
package effect_unknown_in_catch

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
)

var tryMethods = map[string]bool{
	"tryPromise": true, "try": true, "tryMap": true, "tryMapPromise": true,
}

var UnknownInCatchRule = rule.Rule{
	Name: "effect/unknown-in-effect-catch",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindCallExpression: func(node *ast.Node) {
				call := node.AsCallExpression()
				if call.Expression == nil || call.Expression.Kind != ast.KindPropertyAccessExpression {
					return
				}
				propAccess := call.Expression.AsPropertyAccessExpression()
				nameNode := propAccess.Name()
				if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
					return
				}
				if !tryMethods[nameNode.AsIdentifier().Text] {
					return
				}
				if propAccess.Expression == nil ||
					propAccess.Expression.Kind != ast.KindIdentifier ||
					propAccess.Expression.AsIdentifier().Text != "Effect" {
					return
				}

				// Find the options object argument with a "catch" property
				args := call.Arguments.Nodes
				for _, arg := range args {
					if arg.Kind != ast.KindObjectLiteralExpression {
						continue
					}
					obj := arg.AsObjectLiteralExpression()
					for _, prop := range obj.Properties.Nodes {
						if prop.Kind != ast.KindPropertyAssignment {
							continue
						}
						propAssign := prop.AsPropertyAssignment()
						propName := propAssign.Name()
						if propName == nil || propName.Kind != ast.KindIdentifier {
							continue
						}
						if propName.AsIdentifier().Text != "catch" {
							continue
						}

						// Get the type of the catch callback's return value
						catchValue := propAssign.Initializer
						if catchValue == nil {
							continue
						}

						catchType := ctx.TypeChecker.GetTypeAtLocation(catchValue)
						if catchType == nil {
							continue
						}

						// Get call signatures of the catch function
						catchSigs := checker.Checker_getSignaturesOfType(ctx.TypeChecker, catchType, checker.SignatureKindCall)
						if len(catchSigs) == 0 {
							continue
						}

						returnType := checker.Checker_getReturnTypeOfSignature(ctx.TypeChecker, catchSigs[0])
						if returnType == nil {
							continue
						}

						flags := checker.Type_flags(returnType)
						if flags&checker.TypeFlagsUnknown != 0 {
							ctx.ReportNode(node, rule.RuleMessage{
								Id:          "unknownInCatch",
								Description: "The `catch` callback returns `unknown`. Use a specific tagged error type.",
								Help:        "Return a typed error from the catch callback, e.g. new MyError({ cause: e }).",
							})
							return
						}
						if flags&checker.TypeFlagsAny != 0 {
							ctx.ReportNode(node, rule.RuleMessage{
								Id:          "unknownInCatch",
								Description: "The `catch` callback returns `any`. Use a specific tagged error type.",
								Help:        "Return a typed error from the catch callback, e.g. new MyError({ cause: e }).",
							})
							return
						}
					}
				}
			},
		}
	},
}
