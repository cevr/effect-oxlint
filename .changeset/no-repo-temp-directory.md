---
"oxlint-plugin-effect": minor
---

New recommended rule `noRepoTempDirectory`: a test's temp directory lives in the system temp directory. A temp directory under the repo that a killed test leaves behind is linted and scanned as source, and parallel runs share it. In test code it reports a temp directory call (`mkdtemp`, `mkdtempSync`, `makeTempDirectory`, `makeTempDirectoryScoped`) whose argument, or options object, roots it in the repo (`import.meta.dir`, `import.meta.dirname`, `__dirname`, `process.cwd()`, a `join`/`resolve` of a relative literal, a relative `directory` literal, or a `const`/`let` bound to one); a node `mkdtemp` with a relative prefix such as `mkdtempSync("case-")`; and a repo path joined to a `tmp`/`temp` segment (`join(import.meta.dir, ".tmp")`).
