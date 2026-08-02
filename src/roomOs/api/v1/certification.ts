/**
 * certification/v1/run — read-only Certification Engine API.
 */

import {
  runCertification,
  runShantinagarCertification,
} from '@/src/roomOs/certification/runCertification';
import type {
  CertificationError,
  CertificationReport,
  CertificationScope,
} from '@/src/roomOs/certification/types';

export type CertificationRunInput = CertificationScope;

export type RunCertificationApiResult =
  | {
      apiVersion: 'certification/v1';
      status: 'ready';
      report: CertificationReport;
    }
  | {
      apiVersion: 'certification/v1';
      status: 'error';
      error: CertificationError;
    };

export async function runCertificationApi(
  input: CertificationRunInput,
): Promise<RunCertificationApiResult> {
  const result = await runCertification(input);
  if (!result.ok) {
    return { apiVersion: 'certification/v1', status: 'error', error: result.error };
  }
  return { apiVersion: 'certification/v1', status: 'ready', report: result.report };
}

/** Shantinagar parity runner — resolves PG and runs full certification suite. */
export async function runShantinagarCertificationApi(
  input: Omit<CertificationScope, 'pgId'> = {
    requestedAt: new Date().toISOString(),
  },
): Promise<RunCertificationApiResult> {
  const result = await runShantinagarCertification(input);
  if (!result.ok) {
    return { apiVersion: 'certification/v1', status: 'error', error: result.error };
  }
  return { apiVersion: 'certification/v1', status: 'ready', report: result.report };
}

/** Alias matching ROOM_OS.md service method name. */
export const runCertificationV1 = runCertificationApi;
