/**
 * Counted cost of `noLinearSearchInLoop` (catalog SR-P01): the callback calls
 * of a search inside a loop against an index built once. Counts work, never
 * time.
 */
interface Order {
  readonly id: number;
  readonly userId: number;
}
interface User {
  readonly id: number;
  readonly name: string;
}

export interface Cost {
  readonly calls: number;
  readonly names: ReadonlyArray<string>;
}

const fixture = (n: number) => ({
  users: Array.from({ length: n }, (_, id): User => ({ id, name: `user-${id}` })),
  orders: Array.from({ length: n }, (_, id): Order => ({ id, userId: (id * 7) % n })),
});

/** The reported form: `orders.map((order) => users.find(…))`. */
export const searchInLoop = (n: number): Cost => {
  const { users, orders } = fixture(n);
  let calls = 0;
  const names = orders.map(
    (order) =>
      users.find((user) => {
        calls += 1;
        return user.id === order.userId;
      })?.name ?? "",
  );
  return { calls, names };
};

/** The remedy: a `Map` built once, read once per order. */
export const indexOnce = (n: number): Cost => {
  const { users, orders } = fixture(n);
  let calls = 0;
  const byId = new Map(
    users.map((user) => {
      calls += 1;
      return [user.id, user] as const;
    }),
  );
  const names = orders.map((order) => {
    calls += 1;
    return byId.get(order.userId)?.name ?? "";
  });
  return { calls, names };
};
