// Package effect_class_self_mismatch implements the effect/class-self-mismatch rule.
//
// Detects when a class extends Context.Service<Self>, Schema.Class<Self>, etc.
// but the Self type parameter doesn't match the class name. This is almost
// always a copy-paste mistake.
package effect_class_self_mismatch

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/typescript-eslint/tsgolint/internal/rule"
)

// Heritage patterns to check. Each is a call chain like:
//   Context.Service<Self>()("key", ...)    — Self is in outer call type args
//   Schema.Class<Self>("Tag")(...)          — Self is in outer call type args
//   Schema.TaggedErrorClass<Self>()("Tag", ...) — same
var effectPatterns = []heritagePattern{
	// Context/Effect service patterns
	{object: "Context", method: "Service"},
	{object: "Effect", method: "Service"},
	{object: "Context", method: "Tag"},
	{object: "Effect", method: "Tag"},
	// Schema patterns
	{object: "Schema", method: "Class"},
	{object: "Schema", method: "TaggedClass"},
	{object: "Schema", method: "TaggedError"},
	{object: "Schema", method: "TaggedErrorClass"},
	{object: "Schema", method: "TaggedRequest"},
	{object: "Schema", method: "TaggedRequestClass"},
	{object: "Schema", method: "RequestClass"},
}

type heritagePattern struct {
	object string
	method string
}

var ClassSelfMismatchRule = rule.Rule{
	Name: "effect/class-self-mismatch",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindClassDeclaration: func(node *ast.Node) {
				classDecl := node.AsClassDeclaration()
				className := classDecl.Name()
				if className == nil || className.Kind != ast.KindIdentifier {
					return
				}
				classNameText := className.AsIdentifier().Text

				if classDecl.HeritageClauses == nil {
					return
				}

				for _, clause := range classDecl.HeritageClauses.Nodes {
					hc := clause.AsHeritageClause()
					if hc.Types == nil {
						continue
					}
					for _, typeNode := range hc.Types.Nodes {
						selfName, selfTypeNode := extractSelfTypeArg(typeNode)
						if selfName == "" || selfTypeNode == nil {
							continue
						}
						if selfName != classNameText {
							ctx.ReportNode(selfTypeNode, rule.RuleMessage{
								Id:          "classSelfMismatch",
								Description: fmt.Sprintf("Self type `%s` does not match class name `%s`.", selfName, classNameText),
								Help:        fmt.Sprintf("Change the Self type parameter to `%s`.", classNameText),
							})
						}
					}
				}
			},
		}
	},
}

// extractSelfTypeArg walks the heritage expression looking for a known
// Effect/Schema pattern and extracts the Self type argument name.
//
// Handles these shapes:
//   Context.Service<Self>()("key")     — ExpressionWithTypeArguments wrapping call chain
//   Schema.Class<Self>("Tag")({...})
//
// The Self type arg can appear at different nesting levels depending on the
// call chain depth.
func extractSelfTypeArg(typeNode *ast.Node) (string, *ast.Node) {
	ewta := typeNode.AsExpressionWithTypeArguments()
	expr := ewta.Expression
	if expr == nil {
		return "", nil
	}

	// Walk up to find the root call expression and its type arguments
	// The type args on ExpressionWithTypeArguments itself
	if ewta.TypeArguments != nil && len(ewta.TypeArguments.Nodes) > 0 {
		selfNode := ewta.TypeArguments.Nodes[0]
		if name := typeRefName(selfNode); name != "" {
			if matchesPattern(expr) {
				return name, selfNode
			}
		}
	}

	// Check if the expression is a call chain: Obj.Method<Self>()(...)
	// The type args might be on an inner CallExpression
	return walkCallChainForSelf(expr)
}

func walkCallChainForSelf(node *ast.Node) (string, *ast.Node) {
	if node == nil {
		return "", nil
	}

	if node.Kind == ast.KindCallExpression {
		call := node.AsCallExpression()
		// Check type arguments on this call
		if call.TypeArguments != nil && len(call.TypeArguments.Nodes) > 0 {
			selfNode := call.TypeArguments.Nodes[0]
			if name := typeRefName(selfNode); name != "" {
				if matchesPattern(call.Expression) {
					return name, selfNode
				}
			}
		}
		// Recurse into the callee (for chained calls)
		return walkCallChainForSelf(call.Expression)
	}

	return "", nil
}

func matchesPattern(expr *ast.Node) bool {
	if expr == nil {
		return false
	}

	// Direct: Context.Service or Schema.Class
	if expr.Kind == ast.KindPropertyAccessExpression {
		return matchesPropAccess(expr)
	}

	// Call chain: Context.Service<Self>() — the callee of the outer call
	if expr.Kind == ast.KindCallExpression {
		call := expr.AsCallExpression()
		return matchesPattern(call.Expression)
	}

	return false
}

func matchesPropAccess(expr *ast.Node) bool {
	propAccess := expr.AsPropertyAccessExpression()
	nameNode := propAccess.Name()
	if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
		return false
	}
	method := nameNode.AsIdentifier().Text

	obj := propAccess.Expression
	if obj == nil || obj.Kind != ast.KindIdentifier {
		return false
	}
	object := obj.AsIdentifier().Text

	for _, p := range effectPatterns {
		if p.object == object && p.method == method {
			return true
		}
	}
	return false
}

// typeRefName extracts the identifier name from a TypeReferenceNode.
func typeRefName(node *ast.Node) string {
	if node == nil {
		return ""
	}
	if node.Kind == ast.KindTypeReference {
		tr := node.AsTypeReferenceNode()
		typeName := tr.TypeName
		if typeName != nil && typeName.Kind == ast.KindIdentifier {
			return typeName.AsIdentifier().Text
		}
		// QualifiedName: A.B — take the rightmost
		if typeName != nil && typeName.Kind == ast.KindQualifiedName {
			qn := typeName.AsQualifiedName()
			if qn.Right != nil && qn.Right.Kind == ast.KindIdentifier {
				return qn.Right.AsIdentifier().Text
			}
		}
	}
	// Could also be just an identifier (rare)
	if node.Kind == ast.KindIdentifier {
		return node.AsIdentifier().Text
	}
	return ""
}
