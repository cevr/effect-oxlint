// Package effect_overridden_schema_ctor implements the effect/overridden-schema-constructor rule.
//
// Detects when a Schema class (TaggedClass, TaggedError, TaggedRequest)
// overrides the constructor. Schema classes use a specific constructor
// protocol that should not be overridden.
package effect_overridden_schema_ctor

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var OverriddenSchemaCtorRule = rule.Rule{
	Name: "effect/overridden-schema-constructor",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindClassDeclaration: func(node *ast.Node) {
				classDecl := node.AsClassDeclaration()
				if classDecl.Name() == nil {
					return
				}

				// Must have heritage clauses
				if classDecl.HeritageClauses == nil || len(classDecl.HeritageClauses.Nodes) == 0 {
					return
				}

				// Check if this class extends a Schema type from the effect package
				isSchemaClass := false
				for _, clause := range classDecl.HeritageClauses.Nodes {
					hc := clause.AsHeritageClause()
					if hc.Types == nil {
						continue
					}
					for _, typeNode := range hc.Types.Nodes {
						exprWithArgs := typeNode.AsExpressionWithTypeArguments()
						if exprWithArgs.Expression == nil {
							continue
						}
						t := ctx.TypeChecker.GetTypeAtLocation(exprWithArgs.Expression)
						if t == nil {
							continue
						}
						sym := checker.Type_symbol(t)
						if sym != nil && effectutils.IsEffectPackageSymbol(ctx.Program, sym) {
							// Check if the symbol name indicates a Schema class
							if isSchemaTypeName(sym.Name) {
								isSchemaClass = true
								break
							}
						}
					}
					if isSchemaClass {
						break
					}
				}

				if !isSchemaClass {
					return
				}

				// Look for a constructor in the class members
				if classDecl.Members == nil {
					return
				}
				for _, member := range classDecl.Members.Nodes {
					if member.Kind == ast.KindConstructor {
						ctor := member.AsConstructorDeclaration()
						// Allow constructors that are just super(a, b) pass-through
						if isSimpleSuperCall(ctor) {
							continue
						}
						ctx.ReportNode(member, rule.RuleMessage{
							Id:          "overriddenSchemaCtor",
							Description: "Schema class should not override the constructor. Use a static method instead.",
							Help:        "Remove the constructor override, or convert it to a static factory method.",
						})
					}
				}
			},
		}
	},
}

func isSchemaTypeName(name string) bool {
	switch name {
	case "TaggedClass", "TaggedError", "TaggedRequest",
		"Class", "TaggedErrorClass", "TaggedRequestClass":
		return true
	}
	return false
}

// isSimpleSuperCall checks if a constructor body is just `super(param1, param2)`
func isSimpleSuperCall(ctor *ast.ConstructorDeclaration) bool {
	if ctor.Body == nil {
		return false
	}
	stmts := ctor.Body.AsBlock().Statements.Nodes
	if len(stmts) != 1 {
		return false
	}
	stmt := stmts[0]
	if stmt.Kind != ast.KindExpressionStatement {
		return false
	}
	expr := stmt.AsExpressionStatement().Expression
	if expr == nil || expr.Kind != ast.KindCallExpression {
		return false
	}
	call := expr.AsCallExpression()
	if call.Expression == nil || call.Expression.Kind != ast.KindSuperKeyword {
		return false
	}
	// Super call with same number of params as constructor
	return len(call.Arguments.Nodes) == len(ctor.Parameters.Nodes)
}
