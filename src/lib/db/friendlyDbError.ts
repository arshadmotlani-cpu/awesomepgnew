/** Turn postgres/drizzle errors into admin-friendly messages. */
export function friendlyDbError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/proof_snapshot_submitted_paise/i.test(message)) {
    return 'Database schema is outdated (missing payment proof snapshot column). Run migrations 0121–0122, then redeploy.';
  }

  if (/proof_snapshot_/i.test(message)) {
    return 'Database schema is outdated (missing payment proof snapshot columns). Run migration 0121, then redeploy.';
  }

  if (/contact_phone|contact_email|column .* does not exist/i.test(message)) {
    return 'Database schema is outdated (missing PG contact columns). Deploy the latest version, then try again.';
  }

  if (/duplicate key.*pgs_slug|pgs_slug_unique/i.test(message)) {
    return 'That slug is already in use. Pick a different slug or leave it blank to auto-generate one.';
  }

  if (/Failed query:/i.test(message)) {
    return 'Could not save this PG. Check Admin → System for pending migrations, then try again.';
  }

  return message;
}
