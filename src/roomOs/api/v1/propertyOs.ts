/**
 * property-os/v1/loadIndex — reads materialized property_os_index, live fallback.
 */

import {
  loadMaterializedPropertyIndex,
  projectPropertyOsIndex,
} from '@/src/roomOs/projectors/property';
import type { PropertyOsIndexSnapshot } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

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
  const billingMonth = firstOfMonth(input.billingMonth);
  const materialized = await loadMaterializedPropertyIndex({
    pgId: input.pgId,
    billingMonth,
  });
  if (materialized) {
    return { apiVersion: 'property-os/v1', status: 'ready', snapshot: materialized };
  }

  const snapshot = await projectPropertyOsIndex({
    pgId: input.pgId,
    billingMonth: input.billingMonth,
    asOf: input.asOf,
  });
  if (!snapshot) {
    return { apiVersion: 'property-os/v1', status: 'not_materialized', snapshot: null };
  }
  return { apiVersion: 'property-os/v1', status: 'ready', snapshot };
}

export async function loadKpiStrip(input: LoadPropertyIndexInput) {
  const result = await loadPropertyIndex(input);
  return {
    apiVersion: 'property-os/v1' as const,
    kpiStrip: result.snapshot?.kpiStrip ?? null,
    status: result.status,
  };
}
