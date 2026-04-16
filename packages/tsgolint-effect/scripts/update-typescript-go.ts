/**
 * Update typescript-go to latest HEAD, apply patches, regenerate shims.
 *
 * Usage: bun run scripts/update-typescript-go.ts [commit]
 *
 * If [commit] is omitted, fetches latest main branch HEAD.
 * Updates shim go.mods, regenerates shim.go files, copies collections,
 * and verifies the build compiles.
 */
import { $ } from "bun"

const TSGO_REPO = "https://github.com/microsoft/typescript-go.git"
const TSGO_DIR = "typescript-go"
const COLLECTIONS_SRC = `${TSGO_DIR}/internal/collections`
const COLLECTIONS_DST = "internal/collections"

const commit = process.argv[2] ?? "main"

async function run() {
  console.log(`\n→ Updating typescript-go to ${commit === "main" ? "latest HEAD" : commit}\n`)

  // 1. Clone or reset typescript-go
  if (await Bun.file(`${TSGO_DIR}/.git`).exists() || await Bun.file(`${TSGO_DIR}/.git/HEAD`).exists()) {
    console.log("  Resetting existing typescript-go...")
    await $`cd ${TSGO_DIR} && git fetch origin && git checkout ${commit === "main" ? "origin/main" : commit} --force`.quiet()
    await $`cd ${TSGO_DIR} && git clean -fdx`.quiet()
  } else {
    console.log("  Cloning typescript-go...")
    await $`rm -rf ${TSGO_DIR}`.quiet()
    if (commit === "main") {
      await $`git clone --depth 1 ${TSGO_REPO} ${TSGO_DIR}`.quiet()
    } else {
      await $`git init ${TSGO_DIR}`.quiet()
      await $`cd ${TSGO_DIR} && git remote add origin ${TSGO_REPO}`.quiet()
      await $`cd ${TSGO_DIR} && git fetch --depth 1 origin ${commit}`.quiet()
      await $`cd ${TSGO_DIR} && git checkout FETCH_HEAD`.quiet()
    }
  }

  const tsgoCommit = (await $`cd ${TSGO_DIR} && git rev-parse HEAD`.text()).trim()
  const tsgoShort = tsgoCommit.slice(0, 12)
  const tsgoDate = (await $`cd ${TSGO_DIR} && git log -1 --format=%ai`.text()).trim().split(" ")[0]
  console.log(`  ✓ typescript-go at ${tsgoShort} (${tsgoDate})`)

  // 2. Apply patches
  console.log("\n→ Applying patches...\n")
  const patches = (await $`ls patches/*.patch 2>/dev/null`.text()).trim().split("\n").filter(Boolean)
  if (patches.length === 0) {
    console.log("  No patches to apply")
  } else {
    for (const patch of patches) {
      const name = patch.split("/").pop()
      const result = await $`cd ${TSGO_DIR} && git apply --check ../${patch} 2>&1`.nothrow().text()
      if (result.includes("error:")) {
        console.error(`  ✗ ${name} — CONFLICT`)
        console.error(`    ${result.trim()}`)
        console.error("\n  Fix the patch or drop it, then re-run.")
        process.exit(1)
      }
      await $`cd ${TSGO_DIR} && git apply ../${patch}`.quiet()
      console.log(`  ✓ ${name}`)
    }
  }

  // 3. Sync workspace
  console.log("\n→ Syncing Go workspace...\n")
  await $`go work sync`.quiet()
  console.log("  ✓ go work sync")

  // 4. Update shim go.mods
  console.log("\n→ Updating shim dependencies...\n")
  const shimMods = (await $`find ./shim -type f -name go.mod`.text()).trim().split("\n").filter(Boolean)
  for (const modPath of shimMods) {
    const dir = modPath.replace("/go.mod", "")
    const shimName = dir.replace("./shim/", "")
    await $`cd ${dir} && go get github.com/microsoft/typescript-go@${tsgoCommit}`.quiet()
    await $`cd ${dir} && go mod tidy`.quiet()
    console.log(`  ✓ shim/${shimName}`)
  }
  await $`go mod tidy`.quiet()
  console.log("  ✓ root go.mod")

  // 5. Regenerate shims
  console.log("\n→ Regenerating shims...\n")
  await $`go run ./tools/gen_shims`
  console.log("  ✓ shims regenerated")

  // 6. Pin commit for CI
  console.log("\n→ Pinning commit for CI...\n")
  await Bun.write(".typescript-go-commit", tsgoCommit + "\n")
  console.log(`  ✓ .typescript-go-commit → ${tsgoShort}`)

  // 7. Copy collections
  console.log("\n→ Updating internal/collections...\n")
  const collectionFiles = (await $`find ${COLLECTIONS_SRC} -name '*.go' ! -name '*_test.go'`.text())
    .trim().split("\n").filter(Boolean)
  for (const src of collectionFiles) {
    const basename = src.split("/").pop()
    await $`cp -f ${src} ${COLLECTIONS_DST}/${basename}`.quiet()
  }
  console.log(`  ✓ ${collectionFiles.length} files copied`)

  // 7. Verify build
  console.log("\n→ Verifying build...\n")
  await $`go build ./cmd/tsgolint`
  console.log("  ✓ build successful")

  // 8. Run tests
  console.log("\n→ Running Effect rule tests...\n")
  await $`go test ./internal/rules/effect_.../`
  console.log("  ✓ all tests pass")

  // Summary
  console.log(`\n✓ typescript-go updated to ${tsgoShort} (${tsgoDate})`)
  console.log(`  ${patches.length} patches applied, shims regenerated, build verified.`)
  console.log(`\n  Next: review changes with 'git diff', then commit.`)
}

run().catch((err) => {
  console.error("\n✗ Update failed:", err.message ?? err)
  process.exit(1)
})
