import type { capitalDb } from '@/src/capital/db/client';

export type CapitalDatabase = typeof capitalDb;
export type CapitalTransaction = Parameters<Parameters<CapitalDatabase['transaction']>[0]>[0];
export type CapitalDbClient = CapitalDatabase | CapitalTransaction;
