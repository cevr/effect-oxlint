#!/usr/bin/env bash
set -euo pipefail

# Sync the tsgolint fork with upstream oxc-project/tsgolint.
#
# This script:
# 1. Fetches the latest upstream main
# 2. Shows what's changed since our fork point
# 3. Optionally merges upstream changes
#
# Usage:
#   ./scripts/sync-upstream.sh          # Show what's changed
#   ./scripts/sync-upstream.sh --merge  # Merge upstream changes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
UPSTREAM_REMOTE="upstream"
UPSTREAM_URL="https://github.com/oxc-project/tsgolint.git"

cd "$ROOT_DIR"

# Ensure we're in a git repo (the monorepo root)
MONOREPO_ROOT="$(git rev-parse --show-toplevel)"

# Check if upstream remote exists, add if not
if ! git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
  echo "Adding upstream remote: $UPSTREAM_URL"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

echo "Fetching upstream..."
git fetch "$UPSTREAM_REMOTE" main --no-tags 2>&1

# Show what's new
echo ""
echo "=== Upstream changes since our fork ==="
echo ""

# Find the merge base between our main and upstream/main
# We need to compare only the tsgolint-effect subtree
UPSTREAM_HEAD=$(git rev-parse "$UPSTREAM_REMOTE/main")
echo "Upstream HEAD: $UPSTREAM_HEAD"
echo ""

# Show commit log from upstream
git log --oneline "$UPSTREAM_REMOTE/main" -20
echo ""

if [[ "${1:-}" == "--merge" ]]; then
  echo "=== Merging upstream changes ==="
  echo ""
  echo "This will merge upstream tsgolint changes into the current branch."
  echo "You may need to resolve conflicts in the Effect-specific files:"
  echo "  - cmd/tsgolint/main.go (rule registration)"
  echo "  - internal/rules/effect_*/ (if upstream changes rule interfaces)"
  echo "  - internal/utils/effect/ (if upstream changes util signatures)"
  echo ""
  read -p "Continue? [y/N] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Use subtree merge to pull upstream changes into our package
    git subtree pull --prefix=packages/tsgolint-effect "$UPSTREAM_REMOTE" main --squash -m "chore: sync tsgolint upstream"
    echo ""
    echo "✓ Merged upstream. Run 'just init' in packages/tsgolint-effect/ to re-apply patches."
    echo "  Then rebuild: go build -o tsgolint-effect ./cmd/tsgolint"
    echo "  Then test:    go test ./internal/rules/effect_.../"
  else
    echo "Aborted."
  fi
else
  echo "Run with --merge to merge upstream changes."
  echo ""
  echo "After merging:"
  echo "  1. cd packages/tsgolint-effect"
  echo "  2. Re-init: cd typescript-go && git am --3way --no-gpg-sign ../patches/*.patch && cd .."
  echo "  3. Copy collections: find ./typescript-go/internal/collections -type f ! -name '*_test.go' -exec cp {} internal/collections/ \\;"
  echo "  4. Build: go build -o tsgolint-effect ./cmd/tsgolint"
  echo "  5. Test: go test ./internal/rules/effect_.../"
  echo "  6. Fix any conflicts in cmd/tsgolint/main.go (rule imports/registration)"
fi
