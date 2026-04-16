// Package effect_non_object_service_type implements the effect/non-object-service-type rule.
//
// Detects when a Context.Service (or Effect.Service in v3) is defined with a
// primitive type (string, number, boolean, etc.) instead of an object type.
// Services should always be object types for proper structural typing.
package effect_non_object_service_type

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
)

var primitiveFlags = checker.TypeFlagsString |
	checker.TypeFlagsNumber |
	checker.TypeFlagsBoolean |
	checker.TypeFlagsStringLiteral |
	checker.TypeFlagsNumberLiteral |
	checker.TypeFlagsBooleanLiteral |
	checker.TypeFlagsUndefined |
	checker.TypeFlagsNull

func isPrimitiveType(t *checker.Type) bool {
	if t == nil {
		return false
	}
	parts := utils.UnionTypeParts(t)
	for _, part := range parts {
		if checker.Type_flags(part)&primitiveFlags != 0 {
			return true
		}
	}
	return false
}

var NonObjectServiceTypeRule = rule.Rule{
	Name: "effect/non-object-service-type",
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
				name := nameNode.AsIdentifier().Text
				// Match Context.Service or Effect.Service
				if name != "Service" {
					return
				}
				objExpr := propAccess.Expression
				if objExpr == nil || objExpr.Kind != ast.KindIdentifier {
					return
				}
				objName := objExpr.AsIdentifier().Text
				if objName != "Context" && objName != "Effect" {
					return
				}

				// Check the succeed/sync/effect options in the second call
				// Pattern: Context.Service<T>()("key", { succeed: { ... } })
				// The call arguments may contain an options object
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
						key := propName.AsIdentifier().Text
						if key == "succeed" {
							// Direct value — check if it's a primitive
							valueType := ctx.TypeChecker.GetTypeAtLocation(propAssign.Initializer)
							if isPrimitiveType(valueType) {
								ctx.ReportNode(prop, rule.RuleMessage{
									Id:          "nonObjectServiceType",
									Description: "Service type is a primitive. Services should be object types for proper structural typing.",
									Help:        "Wrap the value in an object: { succeed: { value: ... } }",
								})
							}
						}
					}
				}
			},
		}
	},
}
