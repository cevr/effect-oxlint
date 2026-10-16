// Counsel's B4 (2): a thunk handed to a call, expression body against block body.
declare const createClient: (options: unknown) => unknown;
// T1: expression-bodied thunk inside a literal handed to a call (the changeset's carve-out).
createClient({ getFetch: () => fetch });
// T2: the same thunk with a block body.
createClient({
  getFetch: () => {
    return fetch;
  },
});
// T3: a function expression with a block body.
createClient({
  getFetch: function () {
    return globalThis.fetch;
  },
});
