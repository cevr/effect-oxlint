type StringValues = Record<string, string>;

const knownValue = { value: 1 } satisfies { value: number };

export function acceptsOwnedValue(value: { readonly value: number }) {
  return value;
}

export function enrichCause(cause: unknown) {
  return cause;
}

export const values: StringValues = {};
export const optionalValue = { value: knownValue.value };

const users = [{ active: true, email: "a@example.com" }];
export const activeEmails = users.flatMap((user) => (user.active ? [user.email] : []));
export const byEmail = users.reduce<Record<string, (typeof users)[number]>>((accumulator, user) => {
  accumulator[user.email] = user;
  return accumulator;
}, {});
export const length = users.length;
export declare function readPayload(): Promise<{ readonly id: string }>;
