---
"tsgolint-effect": patch
---

Fix two panics that aborted runs on real codebases.

1. **Diagnostic printer** passed a byte length to `GetECMAPositionOfLineAndUTF16Character`, which expects UTF-16 character units. On files with multi-byte characters the printer panicked with `Bad UTF-16 character offset`. Switched to `GetECMAPositionOfLineAndByteOffset`, which accepts the byte value directly.

2. **Brand-based Effect type detection** matched any type structurally exposing a brand property (`~effect/Effect`, `~effect/Layer`, etc.), including types that were not actual type references. Downstream callers then crashed in `Checker.getTypeArguments` with a nil deref. Narrowed `hasEffectBrand` to require `ObjectFlagsReference` on the type so unpacking type arguments is safe.

After both fixes, `tsgolint-effect` runs end-to-end against a v3+v4 dual-version Effect codebase with 214 diagnostics across 5 rules — no panics.
