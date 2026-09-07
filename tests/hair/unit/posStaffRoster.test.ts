import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARSHAD_STAFF_DISPLAY_NAME,
  filterSelectablePosStaff,
  isPosExcludedStaff,
  normalizeStaffName,
} from '@/src/hair/lib/posStaffRoster';
import {
  planStaffIdentityReconcile,
  pickPreferredStaffRow,
  type StaffAuditRow,
} from '@/src/hair/services/staffIdentityReconcile';
import { SYSTEM_OWNER_PROVIDER_ID } from '@/src/workforce/services/systemOwnerProvider';

function staff(partial: Partial<StaffAuditRow> & Pick<StaffAuditRow, 'id' | 'fullName'>): StaffAuditRow {
  return {
    email: null,
    phone: null,
    role: null,
    isActive: true,
    joiningDate: null,
    attributionCount: 0,
    createdAt: new Date('2026-08-01'),
    ...partial,
  };
}

describe('POS staff roster hygiene', () => {
  it('excludes RC seed stylists and system owner placeholder', () => {
    assert.equal(isPosExcludedStaff({ id: 'x', fullName: 'RC Stylist Asha' }), true);
    assert.equal(isPosExcludedStaff({ id: 'x', fullName: 'RC Stylist Rohan' }), true);
    assert.equal(isPosExcludedStaff({ id: SYSTEM_OWNER_PROVIDER_ID, fullName: 'Arshad' }), true);
    assert.equal(isPosExcludedStaff({ id: 'x', fullName: 'Arshad' }), true);
  });

  it('keeps legitimate salon staff', () => {
    assert.equal(isPosExcludedStaff({ id: 'x', fullName: 'LATA KHADSE' }), false);
    assert.equal(isPosExcludedStaff({ id: 'x', fullName: ARSHAD_STAFF_DISPLAY_NAME }), false);
  });

  it('returns one entry per normalized name and excludes dummy rows', () => {
    const rows = filterSelectablePosStaff([
      { id: '1', fullName: 'arshad motlani' },
      { id: '2', fullName: 'Arshad Motlani' },
      { id: '3', fullName: 'RC Stylist Asha' },
      { id: '4', fullName: 'LATA KHADSE' },
      { id: '5', fullName: 'LATA KHADSE' },
    ]);
    assert.deepEqual(
      rows.map((r) => r.fullName),
      ['Arshad Motlani', 'LATA KHADSE'],
    );
  });

  it('normalizes duplicate names case-insensitively', () => {
    assert.equal(normalizeStaffName('  Arshad   Motlani '), normalizeStaffName('arshad motlani'));
  });
});

describe('staff identity reconcile plan', () => {
  it('deactivates RC fixtures and duplicate Arshad rows while keeping one canonical profile', () => {
    const plan = planStaffIdentityReconcile({
      staff: [
        staff({ id: SYSTEM_OWNER_PROVIDER_ID, fullName: 'Arshad' }),
        staff({ id: 'a1', fullName: 'arshad motlani', createdAt: new Date('2026-08-05T01:52:00Z') }),
        staff({ id: 'a2', fullName: 'arshad motlani', createdAt: new Date('2026-08-05T06:59:00Z') }),
        staff({ id: 'rc1', fullName: 'RC Stylist Asha', attributionCount: 2 }),
        staff({ id: 'rc2', fullName: 'RC Stylist Rohan' }),
        staff({ id: 'l1', fullName: 'LATA KHADSE' }),
        staff({ id: 'n1', fullName: 'NIDA MOTLANI' }),
      ],
      admin: {
        id: 'admin1',
        email: 'admin@foryour.co',
        passwordHash: 'scrypt:c5469deadbeef',
      },
    });

    assert.equal(plan.activateCanonicalArshad?.id, 'a1');
    assert.equal(plan.activateCanonicalArshad?.fullName, ARSHAD_STAFF_DISPLAY_NAME);
    assert.ok(plan.deactivate.some((d) => d.id === SYSTEM_OWNER_PROVIDER_ID));
    assert.ok(plan.deactivate.some((d) => d.id === 'a2'));
    assert.ok(plan.deactivate.some((d) => d.id === 'rc1'));
    assert.ok(plan.deactivate.some((d) => d.id === 'rc2'));
    assert.equal(plan.adminEmailMigration?.toEmail, 'arshad@foryour.co');
    assert.deepEqual(plan.selectableActiveAfter, [
      ARSHAD_STAFF_DISPLAY_NAME,
      'LATA KHADSE',
      'NIDA MOTLANI',
    ]);
  });

  it('prefers staff with historical attributions when deduplicating', () => {
    const preferred = pickPreferredStaffRow([
      staff({ id: 'old', fullName: 'duplicate name', attributionCount: 0, createdAt: new Date('2026-01-01') }),
      staff({ id: 'keep', fullName: 'duplicate name', attributionCount: 3, createdAt: new Date('2026-02-01') }),
    ]);
    assert.equal(preferred.id, 'keep');
  });

  it('does not plan admin migration when email already migrated', () => {
    const plan = planStaffIdentityReconcile({
      staff: [staff({ id: 'a1', fullName: ARSHAD_STAFF_DISPLAY_NAME })],
      admin: {
        id: 'admin1',
        email: 'arshad@foryour.co',
        passwordHash: 'scrypt:unchanged',
      },
    });
    assert.equal(plan.adminEmailMigration, null);
  });
});

describe('Quick Sale staff loader uses canonical bookable roster', () => {
  it('searchStaffForPos delegates to listBookableStaffForSalon', () => {
    const src = require('node:fs').readFileSync('src/hair/services/quickSale.ts', 'utf8') as string;
    const fn = src.slice(src.indexOf('export async function searchStaffForPos'));
    assert.match(fn, /listBookableStaffForSalon/);
    assert.doesNotMatch(fn, /from\(fyhStaff\)/);
  });
});
