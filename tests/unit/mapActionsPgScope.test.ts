import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('bed map admin actions PG scope', () => {
  const mapActionsPath = path.join(
    process.cwd(),
    'app/(admin)/admin/pgs/[pgId]/map/actions.ts',
  );
  const source = fs.readFileSync(mapActionsPath, 'utf8');

  it('submitAdminVacatingAction calls assertAdminBookingAccess', () => {
    assert.match(source, /export async function submitAdminVacatingAction/);
    const fnBlock = source.slice(
      source.indexOf('export async function submitAdminVacatingAction'),
      source.indexOf('export async function shiftToReservationAction'),
    );
    assert.match(fnBlock, /assertAdminBookingAccess\(admin, bookingId\)/);
  });

  it('removeTenantFromBedAction calls assertAdminBookingAccess', () => {
    const fnBlock = source.slice(source.indexOf('export async function removeTenantFromBedAction'));
    assert.match(fnBlock, /assertAdminBookingAccess\(session, bookingId\)/);
  });
});
