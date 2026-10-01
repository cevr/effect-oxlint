---
"oxlint-plugin-effect": minor
---

Report `cached*` named imports and remove unsafe exemptions for uninterruptible inputs and function-shaped TTLs. Protecting the input does not protect cache settlement, and a function alone does not establish interruption's lifetime.

Remove the opt-in `noCodeUnitPadding` rule. Display width belongs to the terminal application's policy; Gent now owns a stricter rule with proven ASCII receiver and padding checks.
