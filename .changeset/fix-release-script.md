---
"tsgolint-effect": patch
---

Fix release script so platform binaries actually get published.

The root `release` script only ran `changeset publish`, which publishes `tsgolint-effect` core but not the platform packages (`tsgolint-effect-darwin-arm64`, etc.). Those platforms are published by `packages/tsgolint-effect/scripts/publish-platforms.mjs`, which also rewrites core's `optionalDependencies` to match the new version.

Previous releases shipped `tsgolint-effect@0.3.1` with `optionalDependencies` still pinned to `tsgolint-effect-darwin-arm64@0.1.0` — an old binary from a previous build. On install, bun/npm silently fell back to the 0.1.0 binary because the 0.3.1 platform package didn't exist on npm.

Root `release` now invokes `publish-platforms.mjs` before `changeset publish`, so platform packages bump alongside core and the binaries match. This release republishes the 0.3.1 fixes (printer panic, brand-based detection panic) with actually-updated binaries.
