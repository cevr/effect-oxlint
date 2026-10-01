---
"oxlint-plugin-effect": minor
---

`noAs` also reports the angle-bracket assertion `<T>x` of `.ts` files, with the same message and the same exemption: `<const>x` stays allowed like `as const`. Until now only `typescript/no-unsafe-type-assertion` held that spelling, so a project kept it on as a second owner of assertions.
