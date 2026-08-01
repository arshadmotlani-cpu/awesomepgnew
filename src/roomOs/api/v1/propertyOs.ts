/**
 * property-os/v1/loadIndex — Wave 0 stub.
 * Wave 1 materializes PropertyOsIndexSnapshot from projectors.
 */

import type { PropertyOsIndexSnapshot } from '@/src/roomOs/types';

export type LoadPropertyIndexInput = {
  pgId: string;
  billingMonth: string;
  asOf?: string;
};

export type LoadPropertyIndexResult = {
  apiVersion: 'property-os/v1';
  snapshot: PropertyOsIndexSnapshot | null;
  status: 'not_materialized' | 'ready';
};

export async function loadPropertyIndex(
  input: LoadPropertyIndexInput,
): Promise<LoadPropertyIndexResult> {
  const asOf = input.asOf ?? new Date().toISOString();
  return {
    apiVersion: 'property-os/v1',
    status: 'not_materialized',
    snapshot: null,
  };
}

export async function loadKpiStrip(input: LoadPropertyIndexInput) {
  const result = await loadPropertyIndex(input);
  return {
    apiVersion: 'property-os/v1' as const,
    kpiStrip: result.snapshot?.kpiStrip ?? null,
    status: result.status,
  };
}
