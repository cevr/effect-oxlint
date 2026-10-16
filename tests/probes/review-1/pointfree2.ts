declare const lines: ReadonlyArray<string>

// Q1: console.count takes one label; extra arguments are not printed.
lines.forEach(console.count)

// Q2: console.table prints its first argument as a table; the second is a column filter.
lines.forEach(console.table)

// Q3: console.time starts a timer by label; nothing is printed.
lines.forEach(console.time)

// Q4: console.dir prints its first argument; the second is an options object.
lines.forEach(console.dir)

// Q5: the rule's target, for contrast.
lines.forEach(console.log)
