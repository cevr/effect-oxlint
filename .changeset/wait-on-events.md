---
"oxlint-plugin-effect": minor
---

`effect/noFixedWaitInTests` also reports a `TestClock` advance that lets fibers settle instead of moving time to the input under test: an amount of at most a millisecond (unless it is the second step of a boundary pair after an earlier advance in the same function), an amount read through a name that says flush, settle, tick, drain or yield, and an advance in a polling loop or under a repeater. Its guidance now says to wait on the event and advance `TestClock` only to the time under test.
