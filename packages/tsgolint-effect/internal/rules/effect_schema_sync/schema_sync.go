// Package effect_schema_sync implements the effect/schema-sync-in-effect rule.
//
// Detects usage of Schema.decodeSync/encodeSync/decodeUnknownSync/encodeUnknownSync
// inside Effect.gen/fn generators. Use the Effect-based variants instead.
package effect_schema_sync

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var syncMethods = map[string]string{
	"decodeSync":        "decode",
	"encodeSync":        "encode",
	"decodeUnknownSync": "decodeUnknown",
	"encodeUnknownSync": "encodeUnknown",
}

var SchemaSyncInEffectRule = rule.Rule{
	Name: "effect/schema-sync-in-effect",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindCallExpression: func(node *ast.Node) {
				if !effectutils.IsInsideEffectGen(node) {
					return
				}
				call := node.AsCallExpression()
				if call.Expression == nil || call.Expression.Kind != ast.KindPropertyAccessExpression {
					return
				}
				propAccess := call.Expression.AsPropertyAccessExpression()
				if propAccess.Expression == nil ||
					propAccess.Expression.Kind != ast.KindIdentifier ||
					propAccess.Expression.AsIdentifier().Text != "Schema" {
					return
				}
				methodName := propAccess.Name().Text()
				asyncVariant, ok := syncMethods[methodName]
				if !ok {
					return
				}
				ctx.ReportNode(node, rule.RuleMessage{
					Id:          "schemaSyncInEffect",
					Description: "Schema." + methodName + " used inside Effect.gen/fn. Use Schema." + asyncVariant + " instead.",
					Help:        "Replace Schema." + methodName + " with Schema." + asyncVariant + " for proper error handling in Effect context.",
				})
			},
		}
	},
}
