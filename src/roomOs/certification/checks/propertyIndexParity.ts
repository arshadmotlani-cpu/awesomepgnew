/**
 * Property index materialized vs live parity checks.
 */

import {
  failFinding,
  passFinding,
  warnFinding,
} from '@/src/roomOs/certification/buildReport';
import type { CertificationCheckContext, CertificationFinding } from '@/src/roomOs/certification/types';
import {
  loadMaterializedPropertyIndex,
  projectPropertyOsIndex,
} from '@/src/roomOs/projectors/property';
import type { KpiStripSnapshot, PropertyOsIndexSnapshot } from '@/src/roomOs/types';

function compareKpiStrip(
  materialized: KpiStripSnapshot,
  live: KpiStripSnapshot,
): CertificationFinding[] {
  const findings: CertificationFinding[] = [];
  const fields = [
    'proofsPending',
    'overdueRent',
    'rentDueToday',
    'electricityIncomplete',
    'moveOutsPending',
  ] as const;

  for (const field of fields) {
    const expected = String(materialized[field]);
    const actual = String(live[field]);
    if (expected === actual) {
      findings.push(
        passFinding('PROPERTY_KPI_STRIP_PARITY', 'kpi', `KPI ${field} matches (${expected}).`, {
          field,
        }),
      );
    } else {
      findings.push(
        failFinding(
          'PROPERTY_KPI_STRIP_PARITY',
          'kpi',
          `KPI ${field} mismatch between materialized and live property index.`,
          expected,
          actual,
          { field },
        ),
      );
    }
  }
  return findings;
}

function comparePropertySnapshots(
  materialized: PropertyOsIndexSnapshot,
  live: PropertyOsIndexSnapshot,
): CertificationFinding[] {
  const findings: CertificationFinding[] = [];

  findings.push(...compareKpiStrip(materialized.kpiStrip, live.kpiStrip));

  const progressFields = ['complete', 'incomplete', 'blocked'] as const;
  for (const field of progressFields) {
    const expected = String(materialized.electricityProgress[field]);
    const actual = String(live.electricityProgress[field]);
    if (expected === actual) {
      findings.push(
        passFinding(
          'PROPERTY_INDEX_MATERIALIZED_PARITY',
          'property_index',
          `Electricity progress ${field} matches (${expected}).`,
          { field },
        ),
      );
    } else {
      findings.push(
        failFinding(
          'PROPERTY_INDEX_MATERIALIZED_PARITY',
          'property_index',
          `Electricity progress ${field} mismatch.`,
          expected,
          actual,
          { field },
        ),
      );
    }
  }

  const expectedRooms = String(materialized.roomIndex.length);
  const actualRooms = String(live.roomIndex.length);
  if (expectedRooms === actualRooms) {
    findings.push(
      passFinding(
        'PROPERTY_INDEX_MATERIALIZED_PARITY',
        'property_index',
        `Room index count matches (${expectedRooms}).`,
      ),
    );
  } else {
    findings.push(
      failFinding(
        'PROPERTY_INDEX_MATERIALIZED_PARITY',
        'property_index',
        'Room index count mismatch between materialized and live property index.',
        expectedRooms,
        actualRooms,
      ),
    );
  }

  for (const liveRoom of live.roomIndex) {
    const materializedRoom = materialized.roomIndex.find((r) => r.roomId === liveRoom.roomId);
    if (!materializedRoom) {
      findings.push(
        failFinding(
          'ROOM_ELECTRICITY_STATUS_PARITY',
          'electricity',
          `Room ${liveRoom.label} missing from materialized property index.`,
          liveRoom.electricityStatus,
          'missing',
          { roomId: liveRoom.roomId },
        ),
      );
      continue;
    }
    if (materializedRoom.electricityStatus === liveRoom.electricityStatus) {
      findings.push(
        passFinding(
          'ROOM_ELECTRICITY_STATUS_PARITY',
          'electricity',
          `Room ${liveRoom.label} electricity status matches (${liveRoom.electricityStatus}).`,
          { roomId: liveRoom.roomId },
        ),
      );
    } else {
      findings.push(
        failFinding(
          'ROOM_ELECTRICITY_STATUS_PARITY',
          'electricity',
          `Room ${liveRoom.label} electricity status mismatch.`,
          materializedRoom.electricityStatus,
          liveRoom.electricityStatus,
          { roomId: liveRoom.roomId },
        ),
      );
    }

    if (materializedRoom.occupancySummary === liveRoom.occupancySummary) {
      findings.push(
        passFinding(
          'BED_OCCUPANCY_PARITY',
          'occupancy',
          `Room ${liveRoom.label} occupancy summary matches (${liveRoom.occupancySummary}).`,
          { roomId: liveRoom.roomId },
        ),
      );
    } else {
      findings.push(
        failFinding(
          'BED_OCCUPANCY_PARITY',
          'occupancy',
          `Room ${liveRoom.label} occupancy summary mismatch.`,
          materializedRoom.occupancySummary,
          liveRoom.occupancySummary,
          { roomId: liveRoom.roomId },
        ),
      );
    }
  }

  return findings;
}

export async function runPropertyIndexParityChecks(
  ctx: CertificationCheckContext,
): Promise<CertificationFinding[]> {
  const materialized = await loadMaterializedPropertyIndex({
    pgId: ctx.pgId,
    billingMonth: ctx.billingMonth,
  });
  const live = await projectPropertyOsIndex({
    pgId: ctx.pgId,
    billingMonth: ctx.billingMonth,
    asOf: ctx.asOf,
  });

  if (!live) {
    return [
      failFinding(
        'PROPERTY_INDEX_MATERIALIZED_PARITY',
        'property_index',
        'Live PropertyProjector returned no snapshot for property.',
      ),
    ];
  }

  if (!materialized) {
    return [
      warnFinding(
        'PROPERTY_INDEX_MATERIALIZED_PARITY',
        'property_index',
        'No materialized property_os_index row — live fallback only (pre-cutover).',
        'materialized',
        'live_only',
      ),
      passFinding(
        'PROPERTY_INDEX_MATERIALIZED_PARITY',
        'property_index',
        `Live property index ready with ${live.roomIndex.length} room(s).`,
      ),
    ];
  }

  return comparePropertySnapshots(materialized, live);
}
