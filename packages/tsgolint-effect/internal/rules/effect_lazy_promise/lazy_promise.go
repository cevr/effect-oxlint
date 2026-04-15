// Package effect_lazy_promise implements the effect/lazy-promise-in-sync rule.
//
// Detects `Effect.sync(() => somePromise)` where the thunk returns a Promise.
// Should use Effect.promise or Effect.tryPromise instead.
package effect_lazy_promise

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
)

var LazyPromiseInSyncRule = rule.Rule{
	Name: "effect/lazy-promise-in-sync",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindCallExpression: func(node *ast.Node) {
				call := node.AsCallExpression()
				if call.Expression == nil || call.Expression.Kind != ast.KindPropertyAccessExpression {
					return
				}
				propAccess := call.Expression.AsPropertyAccessExpression()
				if propAccess.Expression == nil ||
					propAccess.Expression.Kind != ast.KindIdentifier ||
					propAccess.Expression.AsIdentifier().Text != "Effect" ||
					propAccess.Name().Text() != "sync" {
					return
				}
				args := call.Arguments.Nodes
				if len(args) < 1 {
					return
				}
				arg := args[0]
				// Check if the callback's return type is a Promise/thenable
				t := ctx.TypeChecker.GetTypeAtLocation(arg)
				signatures := checker.Checker_getSignaturesOfType(ctx.TypeChecker, t, checker.SignatureKindCall)
				for _, sig := range signatures {
					returnType := checker.Checker_getReturnTypeOfSignature(ctx.TypeChecker, sig)
					if returnType != nil && utils.IsThenableType(ctx.TypeChecker, node, returnType) {
						ctx.ReportNode(node, rule.RuleMessage{
							Id:          "lazyPromiseInSync",
							Description: "Effect.sync thunk returns a Promise. Use Effect.promise or Effect.tryPromise instead.",
							Help:        "Effect.sync is for synchronous operations. Use Effect.promise(() => ...) for async operations.",
						})
						return
					}
				}
			},
		}
	},
}
