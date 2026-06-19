/** JSON-safe serialization for RSC → client deposit props. */

export function jsonSafe<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  const serialized = JSON.stringify(value, (_key, v) => {
    if (typeof v === 'bigint') return Number(v);
    if (v instanceof Date) return v.toISOString();
    return v;
  });
  if (serialized === undefined) {
    return value;
  }
  return JSON.parse(serialized) as T;
}
