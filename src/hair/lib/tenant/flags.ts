/** Phase 0B SaaS tenant enforcement — default off until staging cutover. */
export function isFyhSaasTenantEnabled(): boolean {
  return process.env.FYH_SAAS_TENANT === '1' || process.env.FYH_SAAS_TENANT === 'true';
}

/** Platform memberships authoritative for workforce permission checks when enabled. */
export function isWorkforceMembershipAuthEnabled(): boolean {
  return (
    process.env.WORKFORCE_MEMBERSHIP_AUTH === '1' ||
    process.env.WORKFORCE_MEMBERSHIP_AUTH === 'true'
  );
}
