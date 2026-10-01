---
"oxlint-plugin-effect": minor
---

New recommended rule `noModulePathFacts`: a module's file path comes from the Effect `Path` service's `Path.fromFileUrl(new URL("./x.ts", import.meta.url))`. It reports the host path facts `import.meta.dirname`, `import.meta.filename`, `import.meta.dir` and `import.meta.path`; `.pathname` read off a `new URL(...)` that takes `import.meta.url` as any argument, inline or held in a `const`; and `.slice`, `.substring` or `.replace` on `import.meta.url` or on such a URL's `.href`. A hand-read `pathname` keeps percent-escapes and, on Windows, a leading `/C:`. `import.meta.url` alone, `import.meta.main`, and passing the URL to any function stay allowed. Host adapter files turn the rule off with an override.
