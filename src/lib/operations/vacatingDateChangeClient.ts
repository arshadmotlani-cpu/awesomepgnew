import { toIsoTimestampSafe } from '@/src/lib/dates';
import type { VacatingDateChangeRequest } from '@/src/db/schema/vacatingDateChangeRequests';

/** Client-safe vacating date-change row — ISO timestamps for RSC → client boundary. */
export type VacatingDateChangeRequestClient = Omit<
  VacatingDateChangeRequest,
  'createdAt' | 'updatedAt' | 'reviewedAt'
> & {
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

export function toClientVacatingDateChangeRequest(
  row: VacatingDateChangeRequest,
): VacatingDateChangeRequestClient {
  return {
    ...row,
    createdAt: toIsoTimestampSafe(row.createdAt) ?? '',
    updatedAt: toIsoTimestampSafe(row.updatedAt) ?? '',
    reviewedAt: toIsoTimestampSafe(row.reviewedAt),
  };
}
