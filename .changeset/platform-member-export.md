---
"oxlint-plugin-effect": patch
---

`noPlatformLayerOutsideEntry` reports a non-layer member of a platform module that a file exports: `export const socket = BunSocket.makeNet`, `export const { runMain } = BunRuntime`, `export default BunSocket.makeNet`, a named import exported again (`import { makeNet } from "@effect/platform-bun/BunSocket"; export const socket = makeNet`), and each of these through a local alias or an `export { name }` list. Every importer of such an export reaches the platform package where no rule follows it. A member used in place (`BunRuntime.runMain(program)`, `BunSocket.makeNet(options)`) is still not reported.
