#!/usr/bin/env bash
set -euo pipefail

# Cross-compile tsgolint-effect for all supported platforms.
# Outputs binaries into npm/<platform>/tsgolint

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

targets=(
  "darwin arm64"
  "darwin amd64"
  "linux arm64"
  "linux amd64"
)

npm_arch_map() {
  case "$1" in
    amd64) echo "x64" ;;
    arm64) echo "arm64" ;;
  esac
}

for target in "${targets[@]}"; do
  read -r goos goarch <<< "$target"
  npm_arch=$(npm_arch_map "$goarch")
  out_dir="npm/${goos}-${npm_arch}"
  binary_name="tsgolint"

  echo "Building ${goos}/${goarch} → ${out_dir}/${binary_name}"
  GOOS="$goos" GOARCH="$goarch" CGO_ENABLED=0 \
    go build -o "${out_dir}/${binary_name}" ./cmd/tsgolint
done

echo "✓ All binaries built"
