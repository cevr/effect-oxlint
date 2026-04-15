// Package effect provides utilities for detecting Effect types from the "effect" package.
package effect

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/compiler"
)

// IsEffectPackageSymbol checks if a symbol originates from the "effect" package.
func IsEffectPackageSymbol(program *compiler.Program, symbol *ast.Symbol) bool {
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	decl := symbol.Declarations[0]
	sourceFile := ast.GetSourceFileOfNode(decl)
	if sourceFile == nil {
		return false
	}
	path := string(sourceFile.FileName())
	return strings.Contains(path, "node_modules/effect/") ||
		strings.Contains(path, "node_modules/.pnpm/effect@")
}

// IsEffectType checks if a type is Effect.Effect<A, E, R> from the "effect" package.
func IsEffectType(program *compiler.Program, ch *checker.Checker, t *checker.Type) bool {
	if t == nil {
		return false
	}
	sym := checker.Type_symbol(t)
	if sym == nil {
		return false
	}
	if sym.Name != "Effect" {
		return false
	}
	return IsEffectPackageSymbol(program, sym)
}

// IsLayerType checks if a type is Layer.Layer from the "effect" package.
func IsLayerType(program *compiler.Program, ch *checker.Checker, t *checker.Type) bool {
	if t == nil {
		return false
	}
	sym := checker.Type_symbol(t)
	if sym == nil {
		return false
	}
	if sym.Name != "Layer" {
		return false
	}
	return IsEffectPackageSymbol(program, sym)
}

// IsStreamType checks if a type is Stream.Stream from the "effect" package.
func IsStreamType(program *compiler.Program, ch *checker.Checker, t *checker.Type) bool {
	if t == nil {
		return false
	}
	sym := checker.Type_symbol(t)
	if sym == nil {
		return false
	}
	if sym.Name != "Stream" {
		return false
	}
	return IsEffectPackageSymbol(program, sym)
}

// IsEffectLikeType checks if a type is Effect, Layer, or Stream from the "effect" package.
func IsEffectLikeType(program *compiler.Program, ch *checker.Checker, t *checker.Type) bool {
	return IsEffectType(program, ch, t) ||
		IsLayerType(program, ch, t) ||
		IsStreamType(program, ch, t)
}

// IsInsideEffectGen checks if a node is inside an Effect.gen or Effect.fn generator body.
func IsInsideEffectGen(node *ast.Node) bool {
	current := node.Parent
	for current != nil {
		if current.Kind == ast.KindCallExpression {
			call := current.AsCallExpression()
			if call.Expression != nil && call.Expression.Kind == ast.KindPropertyAccessExpression {
				propAccess := call.Expression.AsPropertyAccessExpression()
				if propAccess.Expression != nil &&
					propAccess.Expression.Kind == ast.KindIdentifier &&
					propAccess.Expression.AsIdentifier().Text == "Effect" {
					nameNode := propAccess.Name()
					if nameNode != nil && nameNode.Kind == ast.KindIdentifier {
						name := nameNode.AsIdentifier().Text
						if name == "gen" || name == "fn" {
							return true
						}
					}
				}
			}
		}
		current = current.Parent
	}
	return false
}

// GetEffectErrorChannel extracts the E (error) type parameter from Effect.Effect<A, E, R>.
func GetEffectErrorChannel(program *compiler.Program, ch *checker.Checker, t *checker.Type) *checker.Type {
	if !IsEffectType(program, ch, t) {
		return nil
	}
	args := checker.Checker_getTypeArguments(ch, t)
	if len(args) < 2 {
		return nil
	}
	return args[1]
}

// IsNeverType checks if a type is the `never` type.
func IsNeverType(t *checker.Type) bool {
	if t == nil {
		return false
	}
	return checker.Type_flags(t)&checker.TypeFlagsNever != 0
}
