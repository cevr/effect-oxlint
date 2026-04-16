// Package effect_generic_services implements the effect/generic-services rule.
//
// Detects generic class declarations that extend Context.Service or Context.Tag.
// Generic services cannot be discriminated at runtime and are almost always
// a mistake.
package effect_generic_services

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var GenericServicesRule = rule.Rule{
	Name: "effect/generic-services",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindClassDeclaration: func(node *ast.Node) {
				classDecl := node.AsClassDeclaration()
				name := classDecl.Name()
				if name == nil {
					return
				}

				// Must have type parameters (generic class)
				if classDecl.TypeParameters == nil || len(classDecl.TypeParameters.Nodes) == 0 {
					return
				}

				// Must have heritage clauses (extends something)
				if classDecl.HeritageClauses == nil || len(classDecl.HeritageClauses.Nodes) == 0 {
					return
				}

				// Get the class type and check if it's a Context.Tag or Context.Service
				sym := ctx.TypeChecker.GetSymbolAtLocation(name)
				if sym == nil {
					return
				}
				classType := checker.Checker_getTypeOfSymbol(ctx.TypeChecker, sym)
				if classType == nil {
					return
				}

				// Check if any base type is from the effect package
				baseTypes := checker.Checker_getBaseTypes(ctx.TypeChecker, classType)
				for _, base := range baseTypes {
					baseSym := checker.Type_symbol(base)
					if baseSym != nil && effectutils.IsEffectPackageSymbol(ctx.Program, baseSym) {
						ctx.ReportNode(node, rule.RuleMessage{
							Id:          "genericServices",
							Description: "Generic service classes cannot be discriminated at runtime. Remove the type parameters.",
							Help:        "Effect services should not be generic. Move generic logic into service methods instead.",
						})
						return
					}
				}
			},
		}
	},
}
