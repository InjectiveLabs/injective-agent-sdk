export const bigintReplacer = (_: string, v: unknown): unknown =>
  typeof v === "bigint" ? v.toString() : v;
