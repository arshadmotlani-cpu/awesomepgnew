/** Sole resident account allowed to hold the ₹0 electricity pipeline-test invoice. */
export const PIPELINE_TEST_RESIDENT_EMAIL = 'arshadmotlani0@gmail.com';

export function normalizePipelineTestEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isPipelineTestResidentEmail(email: string | null | undefined): boolean {
  return normalizePipelineTestEmail(email) === normalizePipelineTestEmail(PIPELINE_TEST_RESIDENT_EMAIL);
}
