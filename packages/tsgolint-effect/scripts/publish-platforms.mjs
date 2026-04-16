/**
 * Sync platform package versions with the meta package and publish them.
 *
 * Called by `npm run release` in npm/core/ before the meta package publishes.
 * Reads the current version from npm/core/package.json, updates all platform
 * package.json files to match, and publishes each one.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const npmDir = join(__dirname, "..", "npm")

// Read version from the meta package (already bumped by changesets)
const corePkg = JSON.parse(readFileSync(join(npmDir, "core", "package.json"), "utf-8"))
const version = corePkg.version

const platforms = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]

// Update and publish each platform package
for (const platform of platforms) {
  const pkgPath = join(npmDir, platform, "package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")

  console.log(`Publishing tsgolint-effect-${platform}@${version}`)
  try {
    execSync("npm publish --access public", {
      cwd: join(npmDir, platform),
      stdio: "inherit",
    })
  } catch (e) {
    // If the version already exists, that's fine (idempotent)
    if (e.status === 1) {
      console.log(`  Already published, skipping`)
    } else {
      throw e
    }
  }
}

// Also sync the optionalDependencies versions in core
for (const [dep] of Object.entries(corePkg.optionalDependencies || {})) {
  corePkg.optionalDependencies[dep] = version
}
writeFileSync(join(npmDir, "core", "package.json"), JSON.stringify(corePkg, null, 2) + "\n")

console.log(`✓ Platform packages published at ${version}`)
