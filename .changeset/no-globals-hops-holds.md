---
"oxlint-plugin-effect": minor
---

`noGlobals` follows every hop of the global object to itself: a page's `top`, `parent` and `frames`, a chain of its own names (`globalThis.window`, `window.top`), and `document.defaultView`, so `parent.fetch()` and `document.defaultView.setTimeout()` are reported. A watched global held where the walk cannot follow it (`{ w: window }`, `[document]`, `() => performance`, `mine ?? globalThis`, a `return`) is now reported as a use; handing it to a call stays allowed, since that is how an adapter is built over it. `members` takes a list of bans for one global, so its members can name different replacements, and a configured ban's `use` is named before the built-in one.
