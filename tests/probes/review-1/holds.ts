declare const render: (options: { readonly fetch: typeof fetch }) => void
declare const createClient: (options: { readonly fetch: typeof fetch }) => void
declare const take: (f: typeof fetch) => void

// H1: an escape, handed straight to a call: allowed by the rule's own design.
take(fetch)

// H2: the same escape, wrapped in an options object handed straight to a call.
render({ fetch: globalThis.fetch })

// H3: shorthand in an options object handed to a call.
createClient({ fetch })

// H4: held in a local object literal, then handed on.
const options = { fetch }
render(options)

// H5: a timer held in a record.
export const timers = { setTimeout }

// H6: a global object returned from an arrow.
export const host = () => window

// H7: new with an options object.
declare class Client {
  constructor(options: { readonly fetch: typeof fetch })
}
export const client = new Client({ fetch })
