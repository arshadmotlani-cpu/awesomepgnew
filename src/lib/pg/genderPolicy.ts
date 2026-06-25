export type ResidentGender = 'male' | 'female' | 'other';
export type PgGenderPolicy = 'male' | 'female' | 'coed';

/** Whether a resident's gender satisfies a PG's gender policy. */
export function residentGenderMatchesPgPolicy(
  residentGender: ResidentGender,
  pgGenderPolicy: PgGenderPolicy,
): boolean {
  if (pgGenderPolicy === 'coed') return true;
  if (residentGender === 'other') return false;
  return residentGender === pgGenderPolicy;
}

export function genderPolicyMismatchMessage(pgGenderPolicy: PgGenderPolicy): string {
  return `This PG is restricted to ${pgGenderPolicy} residents. The resident's gender does not match.`;
}

export function validateResidentGenderForPgPolicy(
  residentGender: ResidentGender,
  pgGenderPolicy: PgGenderPolicy,
): { ok: true } | { ok: false; error: string } {
  if (residentGenderMatchesPgPolicy(residentGender, pgGenderPolicy)) {
    return { ok: true };
  }
  return { ok: false, error: genderPolicyMismatchMessage(pgGenderPolicy) };
}
