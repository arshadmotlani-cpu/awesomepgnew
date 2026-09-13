/** Client-side package catalog filter — package name only (case-insensitive). */
export function filterPackagePlansByName<T extends { name: string }>(
  plans: readonly T[],
  query: string,
): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...plans];
  return plans.filter((plan) => plan.name.toLowerCase().includes(normalized));
}
