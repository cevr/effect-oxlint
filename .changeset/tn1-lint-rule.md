---
"oxlint-plugin-effect": minor
---

Add the opt-in rule `effect/tn1Lint`: the advisory findings of TN1 networks (small all-integer networks for judgements exact rules cannot make, such as a comment that narrates the line under it), run by the installed `@cvr/tn1-lint` package, an optional peer dependency. `nets` names each network's weights file. The rule reads each report through the package's generated wire module (`@cvr/tn1-lint/wire`, from the Ergo API's types), so a report that is not tn1-lint's `Report` fails the run instead of being read as findings; the `binary` option needs the package installed too.
