/**
 * Certification check catalog v1 — Shantinagar parity scope.
 */

import type { CertificationDomain } from '@/src/roomOs/certification/types';

export type CertificationCheckDefinition = {
  checkId: string;
  domain: CertificationDomain;
  description: string;
};

export const CERTIFICATION_SUITE_SHANTINAGAR_V1 = 'shantinagar-v1';

export const CERTIFICATION_CHECKS_V1: readonly CertificationCheckDefinition[] = [
  {
    checkId: 'PROPERTY_INDEX_MATERIALIZED_PARITY',
    domain: 'property_index',
    description: 'Materialized property_os_index matches live PropertyProjector output.',
  },
  {
    checkId: 'WORK_QUEUE_MATERIALIZED_PARITY',
    domain: 'work_queue',
    description: 'Materialized work_queue_index matches live WorkQueueProjector output.',
  },
  {
    checkId: 'PROPERTY_KPI_STRIP_PARITY',
    domain: 'kpi',
    description: 'Property KPI strip counts match between materialized and live projections.',
  },
  {
    checkId: 'ROOM_ELECTRICITY_STATUS_PARITY',
    domain: 'electricity',
    description: 'Room electricity status in property index matches Electricity Engine live-read.',
  },
  {
    checkId: 'BED_OCCUPANCY_PARITY',
    domain: 'occupancy',
    description: 'Bed Brain residency status matches Occupancy Engine live-read for active residents.',
  },
  {
    checkId: 'BOOKING_LEDGER_PARITY',
    domain: 'ledger',
    description: 'Booking ledger projection totals match residentFinancialEngine SSOT.',
  },
  {
    checkId: 'PAYMENT_PROOF_STATE_PARITY',
    domain: 'ledger',
    description: 'Ledger payment proof state matches pending proofs across all proof kinds (qr, rent, elec, extension, deposit_link).',
  },
  {
    checkId: 'SHANTINAGAR_PORTAL_PARITY',
    domain: 'portal',
    description: 'Resident portal amounts match invoice-engine and admin RFE SSOT (12/12 gate).',
  },
  {
    checkId: 'RFE_BED_BRAIN_BRIDGE',
    domain: 'ledger',
    description: 'RFE booking totals resolve via Bed Brain → LedgerProjection (Wave 3).',
  },
  {
    checkId: 'REPLAY_SAMPLE_PARITY',
    domain: 'replay',
    description: 'Dry-run replay sample matches materialized property/work queue snapshots (Wave 4).',
  },
  {
    checkId: 'RULES_DB_PARITY',
    domain: 'rules',
    description: 'DB-seeded effective pack matches code catalog for same pgId/asOf (Wave 5).',
  },
  {
    checkId: 'TIMELINE_LAYER_B',
    domain: 'timeline',
    description: 'Timeline entries rebuild deterministically from outbox Layer A events (Wave 5).',
  },
  {
    checkId: 'WORKFLOW_PAYMENT_PROOF_PARITY',
    domain: 'workflow',
    description:
      'Payment proof state machine transitions are valid; sampled workflow instances for proof queue items have recognized states.',
  },
  {
    checkId: 'BUSINESS_METRICS_ROLLUP_PARITY',
    domain: 'metrics',
    description:
      'Materialized rollup ops counts match property index; financial slice matches financialMetricsEngine for same (pgId, billingMonth).',
  },
] as const;

export const SHANTINAGAR_RESIDENT_PARITY_TARGET = 12;
