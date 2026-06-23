/**
 * Data repair for Shanti Nagar Room 203 Bed B5 vacating/refund lifecycle drift.
 *
 * Audit only (default):
 *   DATABASE_URL='postgres://…' npx tsx scripts/repair-bed-203-b5.ts
 *
 * Apply fixes:
 *   DATABASE_URL='postgres://…' npx tsx scripts/repair-bed-203-b5.ts --execute
 */
import postgres from 'postgres';
import { syncResidentRequestActionItems } from '../src/services/residentRequestActions';
import { executeCheckoutSettlementRepair } from '../src/services/checkoutSettlementRepair';

const EXECUTE = process.argv.includes('--execute');

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(url, {
    max: 1,
    connect_timeout: 15,
    ssl: url.includes('localhost') ? undefined : 'require',
  });

  const [bed] = await sql`
    SELECT b.id AS bed_id
    FROM pgs p
    JOIN floors f ON f.pg_id = p.id AND f.archived_at IS NULL
    JOIN rooms r ON r.floor_id = f.id AND r.archived_at IS NULL
    JOIN beds b ON b.room_id = r.id AND b.archived_at IS NULL
    WHERE p.name ILIKE '%shanti%' AND r.room_number = '203' AND b.bed_code ILIKE '%5%'
    LIMIT 1
  `;

  if (!bed?.bed_id) {
    console.error('Bed 203 B5 not found');
    await sql.end();
    process.exit(1);
  }

  const bookingRows = await sql`
    SELECT DISTINCT br.booking_id::text AS booking_id
    FROM bed_reservations br
    WHERE br.bed_id = ${bed.bed_id}::uuid
  `;

  console.log('Target bed:', bed.bed_id);
  console.log('Bookings on bed:', bookingRows.map((r) => r.booking_id));

  for (const { booking_id: bookingId } of bookingRows) {
    const stalePrimary = await sql`
      SELECT br.id, br.status, lower(br.stay_range)::text AS stay_from, upper(br.stay_range)::text AS stay_to
      FROM bed_reservations br
      WHERE br.booking_id = ${bookingId}::uuid
        AND br.kind = 'primary'
        AND br.status NOT IN ('hold', 'active')
      ORDER BY br.created_at ASC
    `;

    if (stalePrimary.length > 0) {
      console.log(`\n[${bookingId}] stale primary reservations:`, stalePrimary.length);
      if (EXECUTE) {
        for (const row of stalePrimary) {
          await sql`
            UPDATE bed_reservations
            SET status = 'completed', updated_at = now()
            WHERE id = ${row.id}::uuid AND status NOT IN ('completed', 'cancelled')
          `;
        }
        console.log('  closed stale primary rows');
      }
    }

    if (EXECUTE) {
      const resolved = await sql`
        UPDATE action_items ai
        SET status = 'resolved', updated_at = now()
        WHERE ai.type IN ('refund_request_submitted', 'deposit_refund_request')
          AND ai.status IN ('open', 'in_progress')
          AND ai.metadata->>'bookingId' = ${bookingId}
          AND EXISTS (
            SELECT 1 FROM checkout_settlements cs
            WHERE cs.booking_id = ${bookingId}::uuid
              AND cs.status NOT IN ('archived', 'completed', 'refund_paid')
          )
        RETURNING ai.id
      `;
      if (resolved.length > 0) {
        console.log(`[${bookingId}] resolved ${resolved.length} stale refund action_items`);
      }
    } else {
      const stale = await sql`
        SELECT ai.id, ai.type, ai.source_key
        FROM action_items ai
        WHERE ai.type IN ('refund_request_submitted', 'deposit_refund_request')
          AND ai.status IN ('open', 'in_progress')
          AND ai.metadata->>'bookingId' = ${bookingId}
          AND EXISTS (
            SELECT 1 FROM checkout_settlements cs
            WHERE cs.booking_id = ${bookingId}::uuid
              AND cs.status NOT IN ('archived', 'completed', 'refund_paid')
          )
      `;
      if (stale.length > 0) {
        console.log(`[${bookingId}] would resolve ${stale.length} stale refund action_items`);
      }
    }
  }

  if (EXECUTE) {
    await syncResidentRequestActionItems();
    const repair = await executeCheckoutSettlementRepair({
      adminId: '00000000-0000-0000-0000-000000000001',
      dryRun: false,
    });
    console.log('\ncheckout_settlement_repair:', repair);
  } else {
    console.log('\nDry run — pass --execute to apply repairs');
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
