type HiddenInput = unknown;
type UnsafeValues = Record<string, unknown>;

const knownValue: unknown = { value: 1 };
const restoredValue = knownValue as { value: number };
export const fabricatedValue = { value: 1 } as unknown as { value: number };

export function acceptsBroadObject(value: object) {
  return value;
}

export function acceptsUnknownInput(value: unknown) {
  return value;
}

export const userShape = typeof restoredValue;
export const optionalValue = {
  ...(restoredValue.value === 1 ? { value: restoredValue.value } : {}),
};

export type InvalidTypes = HiddenInput | UnsafeValues;

const users = [{ active: true, email: "a@example.com" }];
export const activeEmails = users.filter((user) => user.active).map((user) => user.email);
export const byEmail = users.reduce(
  (accumulator, user) => Object.assign({}, accumulator, { [user.email]: user }),
  {},
);
export const reflected = Reflect.get(users, "length");
export const applied = Reflect.apply(Math.max, undefined, [1, 2]);
export declare function readPayload(): Promise<unknown>;
