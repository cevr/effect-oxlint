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
