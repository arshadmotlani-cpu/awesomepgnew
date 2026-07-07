import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(
  join(process.cwd(), 'src/lib/residents/residentPortalAccess.ts'),
  'utf8',
);

test('resident portal SSOT blocks reserve lifecycle before tenancy check', () => {
  assert.match(src, /customerHasOpenReserveLifecycle/);
  assert.match(src, /if \(await customerHasOpenReserveLifecycle\(customerId\)\) return false/);
});

test('resident routes layout redirects reserve users to booking page', () => {
  const layout = readFileSync(
    join(process.cwd(), 'app/(customer)/account/resident/layout.tsx'),
    'utf8',
  );
  assert.match(layout, /getOpenReserveBookingCode/);
  assert.match(layout, /customerHasResidentPortalAccess/);
  assert.match(layout, /redirect\(`\/booking\/\$\{/);
});

test('profile page gates resident dashboard on hasResidentPortalAccess', () => {
  const profile = readFileSync(
    join(process.cwd(), 'app/(customer)/account/profile/page.tsx'),
    'utf8',
  );
  assert.match(profile, /hasResidentPortalAccess && !explicitSettings/);
});
