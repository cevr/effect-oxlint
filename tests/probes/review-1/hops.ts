// K1: a tree walker's parameter named parent, reading a member named like a global.
export const pid = (parent: { readonly process: { readonly pid: number } }) => parent.process.pid

// K2: a local document from a parser, then its defaultView.
declare const parse: (html: string) => { readonly defaultView: { readonly Date: { readonly now: () => number } } }
export const parsed = () => {
  const document = parse("<p></p>")
  return document.defaultView.Date.now()
}

// K3: a local array named frames.
export const count = (frames: ReadonlyArray<number>) => frames.map((frame) => frame + 1)

// K4: a destructured parameter named top.
export const topOf = ({ top }: { readonly top: { readonly fetch: () => number } }) => top.fetch()

// K5: an object literal key named console, value not the global.
export const keyed = { console: 1 }

// K6: a held global through a ternary handed to a call.
declare const take: (value: unknown) => void
declare const mine: unknown
take(mine ?? globalThis)
