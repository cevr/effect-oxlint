---
"oxlint-plugin-effect": patch
---

Publish compiled JS instead of raw TypeScript.

Previous versions shipped `./src/*.ts` in `exports`. oxlint loads plugins through Node's ESM loader, which refuses to strip types from files under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`) — meaning the plugin was uninstallable by any consumer.

Added a `tsdown` build and changed `exports` to point at `./dist/*.js`. The `release` script now runs the build before `changeset publish`.
