---
"oxlint-plugin-effect": patch
---

`noPlatformLayerOutsideEntry` reports a platform package or module exported as the value of a declaration: `export const Fs = BunFileSystem`, `export let P = Platform`, `export const Fs = Platform.BunFileSystem`, `export const { BunPath } = Platform`, and an exported alias of an alias. The exported binding has no reads in its own file, so the rule could not follow it to a `layer` read.
