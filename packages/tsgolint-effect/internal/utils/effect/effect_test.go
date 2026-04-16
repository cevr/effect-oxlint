package effect

import "testing"

func TestEffectPackagePathRegex(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		// v4 via npm/yarn-classic
		{"/app/node_modules/effect/dist/index.d.ts", true},
		{"/app/node_modules/effect/src/Effect.ts", true},
		// v3 alias
		{"/app/node_modules/effect-v3/dist/index.d.ts", true},
		{"/app/node_modules/effect-v3/src/Effect.ts", true},
		// pnpm
		{"/app/node_modules/.pnpm/effect@4.0.0-beta.47/node_modules/effect/dist/index.d.ts", true},
		{"/app/node_modules/.pnpm/effect-v3@3.21.0/node_modules/effect-v3/dist/index.d.ts", true},
		// bun isolated
		{"/app/node_modules/.bun/effect@4.0.0-beta.47/node_modules/effect/dist/index.d.ts", true},
		// yarn berry cache
		{"/app/.yarn/cache/effect-npm-4.0.0-beta.47-abc.zip/node_modules/effect/dist/index.d.ts", true},
		// monorepo — hoisted at workspace root or nested in a package
		{"/repo/packages/foo/node_modules/effect/dist/index.d.ts", true},

		// negatives — other packages
		{"/app/node_modules/effect-schema/dist/index.d.ts", false},
		{"/app/node_modules/@effect/platform/dist/index.d.ts", false},
		{"/app/node_modules/my-effect/dist/index.d.ts", false},
		{"/app/src/effect/my-module.ts", false},
		// user code with a dir literally called "effect" at top level
		{"/app/effect/my-module.ts", false},
	}

	for _, tc := range cases {
		got := effectPackagePathRe.MatchString(tc.path)
		if got != tc.want {
			t.Errorf("effectPackagePathRe.MatchString(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}
