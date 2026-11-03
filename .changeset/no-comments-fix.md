---
"oxlint-plugin-effect": patch
---

`effect/noComments` now autofixes: `oxlint --fix` removes each reported comment, with its line when the comment stands alone, the space before it when it trails code, and one space beside it when it sits between tokens. Tool directives stay.
