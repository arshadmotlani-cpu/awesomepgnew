/** Normalize chart series props — loaders should always return arrays; guards deploy skew. */
export function chartRows<T>(data: T[] | undefined | null): T[] {
  return data ?? [];
}
