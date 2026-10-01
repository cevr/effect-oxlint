---
"oxlint-plugin-effect": minor
---

New opt-in rule `noCodeUnitPadding`: it reports `padStart` and `padEnd` on any receiver but a number rendered as ASCII (`String(n)`, `n.toString(…)`, `toFixed`, `toPrecision`, `toExponential`). Both count UTF-16 code units, so a wide, combining or emoji character misaligns a padded column; pad by display width instead. A project enables it for the files that draw columns (a terminal UI, a CLI table) with an override.
