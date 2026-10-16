// N1: the global object held, with no ban configured and the built-ins off.
export const kept = { w: window }

// N2: a call of a built-in, for contrast (nothing is banned).
export const now = Date.now()
