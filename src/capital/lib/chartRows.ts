/** Normalize chart series props — SSR contract guarantees arrays; guards deploy skew. */
export function chartRows<T>(data: T[] | undefined | null): T[] {
  return data ?? [];
}
