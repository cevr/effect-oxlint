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
