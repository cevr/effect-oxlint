import { Console, Effect, Exit, Option } from "effect"

declare const observable: { readonly forEach: (f: (value: number) => void) => Promise<void> }
declare const exit: Exit.Exit<number>

// F1: a one-value observable API, not a list.
export const subscribed = observable.forEach(console.log)

// F2: Exit.map, a one-value module function.
export const logged = Exit.map(exit, Console.log)

// F3: Option.map with a logger.
export const maybe = Option.map(Option.some(1), Console.log)

// F4: an array logged point-free (the rule's target).
export const all = [1, 2, 3].forEach(console.log)

// F5: Effect.forEach with Console.log (excluded receiver).
export const each = Effect.forEach([1, 2], Console.log)
