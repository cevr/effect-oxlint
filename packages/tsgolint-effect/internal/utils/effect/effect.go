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

// GetEffectSuccessChannel extracts the A (success) type parameter from Effect.Effect<A, E, R>.
func GetEffectSuccessChannel(program *compiler.Program, ch *checker.Checker, t *checker.Type) *checker.Type {
	if !IsEffectType(program, ch, t) {
		return nil
	}
	args := checker.Checker_getTypeArguments(ch, t)
	if len(args) < 1 {
		return nil
	}
	return args[0]
}

// GetEffectContextChannel extracts the R (requirements/context) type parameter from Effect.Effect<A, E, R>.
func GetEffectContextChannel(program *compiler.Program, ch *checker.Checker, t *checker.Type) *checker.Type {
	if !IsEffectType(program, ch, t) {
		return nil
	}
	args := checker.Checker_getTypeArguments(ch, t)
	if len(args) < 3 {
		return nil
	}
	return args[2]
}

// GetLayerChannels extracts (ROut, E, RIn) from Layer.Layer<ROut, E, RIn>.
func GetLayerChannels(program *compiler.Program, ch *checker.Checker, t *checker.Type) (rOut, e, rIn *checker.Type) {
	if !IsLayerType(program, ch, t) {
		return nil, nil, nil
	}
	args := checker.Checker_getTypeArguments(ch, t)
	if len(args) >= 1 {
		rOut = args[0]
	}
	if len(args) >= 2 {
		e = args[1]
	}
	if len(args) >= 3 {
		rIn = args[2]
	}
	return
}

// GetMissingTypes returns types from `real` that are not assignable to any type in `expected`.
// Useful for checking missing services in R or missing errors in E.
func GetMissingTypes(ch *checker.Checker, real []*checker.Type, expected *checker.Type) []*checker.Type {
	var missing []*checker.Type
	for _, t := range real {
		if IsNeverType(t) {
			continue
		}
		if !checker.Checker_isTypeAssignableTo(ch, expected, t) {
			missing = append(missing, t)
		}
	}
	return missing
}

// TypeToString converts a type to its string representation.
func TypeToString(ch *checker.Checker, t *checker.Type) string {
	if t == nil {
		return "unknown"
	}
	return ch.TypeToString(t)
}

// IsYieldableErrorType checks if a type extends YieldableError from the "effect" package.
// YieldableError types can be yielded directly without wrapping in Effect.fail.
func IsYieldableErrorType(program *compiler.Program, ch *checker.Checker, t *checker.Type) bool {
	if t == nil {
		return false
	}
	flags := checker.Type_flags(t)
	if flags&checker.TypeFlagsNever != 0 || flags&checker.TypeFlagsAny != 0 {
		return false
	}
	// Check if the type has a [Symbol.iterator] or [Effect.EffectTypeId] marker
	// that makes it yieldable. In practice, TaggedError/TaggedErrorClass types
	// extend YieldableError which implements Effect<never, Self>.
	// We check by looking for the Effect type's symbol marker on the type itself.
	sym := checker.Type_symbol(t)
	if sym == nil {
		return false
	}
	// Walk the base types to find if any is from the effect package and is yieldable
	baseTypes := checker.Checker_getBaseTypes(ch, t)
	for _, base := range baseTypes {
		baseSym := checker.Type_symbol(base)
		if baseSym == nil {
			continue
		}
		if IsEffectPackageSymbol(program, baseSym) {
			// If a base type is from Effect package, this is likely a TaggedError/YieldableError
			return true
		}
	}
	return false
}

// IsScopeType checks if a type is Scope.Scope from the "effect" package.
func IsScopeType(program *compiler.Program, ch *checker.Checker, t *checker.Type) bool {
	if t == nil {
		return false
	}
	// Check symbol name — Scope type is named "Scope" in the effect package
	sym := checker.Type_symbol(t)
	if sym != nil && sym.Name == "Scope" && IsEffectPackageSymbol(program, sym) {
		return true
	}
	// v4: check for "~effect/Scope" property marker
	scopeProp := checker.Checker_getPropertyOfType(ch, t, "~effect/Scope")
	if scopeProp != nil {
		return true
	}
	// Check if any property name contains "ScopeTypeId" (v3 marker)
	props := checker.Checker_getPropertiesOfType(ch, t)
	for _, prop := range props {
		if strings.Contains(prop.Name, "ScopeTypeId") || strings.Contains(prop.Name, "Scope") {
			return true
		}
	}
	return false
}

// IsAnyType checks if a type is the `any` type.
func IsAnyType(t *checker.Type) bool {
	if t == nil {
		return false
	}
	return checker.Type_flags(t)&checker.TypeFlagsAny != 0
}

// IsUnknownType checks if a type is the `unknown` type.
func IsUnknownType(t *checker.Type) bool {
	if t == nil {
		return false
	}
	return checker.Type_flags(t)&checker.TypeFlagsUnknown != 0
}
