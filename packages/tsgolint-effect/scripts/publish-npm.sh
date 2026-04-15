#!/usr/bin/env bash
set -euo pipefail

# Publish tsgolint-effect and all platform packages to npm.
# Must be run after build-binaries.sh.
#
# Usage: VERSION=0.1.0 ./scripts/publish-npm.sh [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DRY_RUN=""

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "DRY RUN MODE"
fi

if [[ -z "${VERSION:-}" ]]; then
  echo "ERROR: VERSION env var required. Usage: VERSION=0.1.0 ./scripts/publish-npm.sh"
  exit 1
fi

cd "$ROOT_DIR"

platforms=(darwin-arm64 darwin-x64 linux-arm64 linux-x64)

# Update all versions
for platform in "${platforms[@]}"; do
  jq --arg v "$VERSION" '.version = $v' "npm/$platform/package.json" > tmp.json && mv tmp.json "npm/$platform/package.json"
done

# Update core package version + optionalDependencies versions
jq --arg v "$VERSION" '.version = $v | .optionalDependencies |= with_entries(.value = $v)' \
  npm/core/package.json > tmp.json && mv tmp.json npm/core/package.json

# Publish platform packages first
for platform in "${platforms[@]}"; do
  echo "Publishing @effect-oxlint/tsgolint-${platform}@${VERSION}"
  (cd "npm/$platform" && npm publish --access public --provenance $DRY_RUN)
done

# Publish core meta package
echo "Publishing tsgolint-effect@${VERSION}"
(cd npm/core && npm publish --access public --provenance $DRY_RUN)

echo "✓ Published tsgolint-effect@${VERSION}"
