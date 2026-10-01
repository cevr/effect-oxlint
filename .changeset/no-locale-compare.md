---
"oxlint-plugin-effect": minor
---

New recommended rule `noLocaleCompare`: it reports `localeCompare` on any receiver (`a.localeCompare(b)`, `a["localeCompare"]`) and `Intl.Collator` called or constructed through any spelling of the global (`new Intl.Collator()`, `Intl.Collator()`, `globalThis.Intl.Collator`, an alias or destructure of `Intl`). Both order by the locale and ICU data of the running process, so the same input sorts differently on another machine; output that must be stable, such as prompt bytes and listings, uses `Order.String`, which orders by UTF-16 code unit.
