const topValue: unknown = { value: 1 };
export const restoredTop = topValue as { value: number };

const recordValue: Readonly<Record<string, unknown>> = { value: 1 };
export const restoredRecord = recordValue as { value: number };

const ownedValue = { value: 1 };
const aliasedValue: unknown = ownedValue;
export const restoredAlias = aliasedValue as { value: number };
