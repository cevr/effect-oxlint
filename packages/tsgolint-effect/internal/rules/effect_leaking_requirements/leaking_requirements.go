// Package effect_leaking_requirements implements the effect/leaking-requirements rule.
//
// Detects service interfaces where implementation-level services leak into
// the public API surface. This happens when service methods carry shared
// R (requirements) types that expose internal dependencies.
//
// For example, if a UserService has methods that all require DatabaseService,
// that dependency should be provided internally, not leaked to consumers.
package effect_leaking_requirements

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/typescript-eslint/tsgolint/internal/rule"
	"github.com/typescript-eslint/tsgolint/internal/utils"
	effectutils "github.com/typescript-eslint/tsgolint/internal/utils/effect"
)

var LeakingRequirementsRule = rule.Rule{
	Name: "effect/leaking-requirements",
	Run: func(ctx rule.RuleContext, options any) rule.RuleListeners {
		return rule.RuleListeners{
			ast.KindClassDeclaration: func(node *ast.Node) {
				checkClassForLeaks(ctx, node)
			},
			ast.KindInterfaceDeclaration: func(node *ast.Node) {
				checkInterfaceForLeaks(ctx, node)
			},
		}
	},
}

func checkClassForLeaks(ctx rule.RuleContext, node *ast.Node) {
	classDecl := node.AsClassDeclaration()
	if classDecl.Name() == nil {
		return
	}

	// Check if this extends Context.Service or similar Effect service pattern
	sym := ctx.TypeChecker.GetSymbolAtLocation(classDecl.Name())
	if sym == nil {
		return
	}

	classType := checker.Checker_getTypeOfSymbol(ctx.TypeChecker, sym)
	if classType == nil {
		return
	}

	checkTypeForLeakingRequirements(ctx, node, classType)
}

func checkInterfaceForLeaks(ctx rule.RuleContext, node *ast.Node) {
	ifaceDecl := node.AsInterfaceDeclaration()

	sym := ctx.TypeChecker.GetSymbolAtLocation(ifaceDecl.Name())
	if sym == nil {
		return
	}

	ifaceType := checker.Checker_getDeclaredTypeOfSymbol(ctx.TypeChecker, sym)
	if ifaceType == nil {
		return
	}

	checkTypeForLeakingRequirements(ctx, node, ifaceType)
}

func checkTypeForLeakingRequirements(ctx rule.RuleContext, node *ast.Node, serviceType *checker.Type) {
	properties := checker.Checker_getPropertiesOfType(ctx.TypeChecker, serviceType)
	if len(properties) == 0 {
		return
	}

	// Collect all R (requirements) types from Effect-returning methods
	var allRequirements []*checker.Type
	methodCount := 0

	for _, prop := range properties {
		propType := checker.Checker_getTypeOfSymbol(ctx.TypeChecker, prop)
		if propType == nil {
			continue
		}

		// Check if this property returns an Effect
		sigs := checker.Checker_getSignaturesOfType(ctx.TypeChecker, propType, checker.SignatureKindCall)
		for _, sig := range sigs {
			retType := checker.Checker_getReturnTypeOfSignature(ctx.TypeChecker, sig)
			if retType == nil {
				continue
			}

			if !effectutils.IsEffectType(ctx.Program, ctx.TypeChecker, retType) {
				continue
			}

			methodCount++
			rChannel := effectutils.GetEffectContextChannel(ctx.Program, ctx.TypeChecker, retType)
			if rChannel == nil || effectutils.IsNeverType(rChannel) {
				continue
			}

			parts := utils.UnionTypeParts(rChannel)
			for _, p := range parts {
				if !effectutils.IsNeverType(p) {
					allRequirements = append(allRequirements, p)
				}
			}
		}
	}

	// Need at least 2 Effect-returning methods to detect shared leaking requirements
	if methodCount < 2 || len(allRequirements) == 0 {
		return
	}

	// Find requirements that appear in ALL methods (shared leaks)
	// Count occurrences by type string (approximate, but good enough)
	typeCounts := make(map[string]int)
	typeMap := make(map[string]*checker.Type)
	for _, t := range allRequirements {
		name := effectutils.TypeToString(ctx.TypeChecker, t)
		typeCounts[name]++
		typeMap[name] = t
	}

	var leaked []string
	for name, count := range typeCounts {
		if count >= methodCount {
			leaked = append(leaked, name)
		}
	}

	if len(leaked) > 0 {
		ctx.ReportNode(node, rule.RuleMessage{
			Id:          "leakingRequirements",
			Description: fmt.Sprintf("Service leaks implementation requirements: %s. All methods require these services, indicating they should be provided internally.", strings.Join(leaked, ", ")),
			Help:        "Provide these services in the service's Layer instead of exposing them in the public API.",
		})
	}
}
