/* eslint-disable no-console */
/**
 * Query production DB logs and schema for KYC upload failures.
 * Requires DATABASE_URL in .env (Neon production).
 */
import 'dotenv/config';
import { desc, gte, ilike, or, sql } from 'drizzle-orm';
import { createClient, closeDb } from '../src/db/client';
import { appLogs } from '../src/db/schema';
import { isBlobPrivateConfigured } from '../src/lib/storage/blob';

async function main() {
  console.log('\n=== KYC production investigation ===\n');

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const { db, sql: pg } = createClient({ max: 1 });

  // Migration 0034 check
  const migRows = await pg<{ tag: string }[]>`
    SELECT tag FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5
  `.catch(() => null);

  if (migRows) {
    console.log('Latest migrations in DB:');
    for (const r of migRows) console.log('  -', r.tag);
    const has34 = migRows.some((r) => r.tag.includes('0034'));
    console.log(has34 ? '✓ 0034_kyc_external_storage present' : '✗ 0034 NOT applied');
  } else {
    console.log('Could not read drizzle.__drizzle_migrations');
  }

  // Schema columns
  const cols = await pg<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'kyc_submissions'
      AND column_name IN ('aadhaar_front_mime', 'selfie_mime')
    ORDER BY column_name
  `;
  console.log('\nkyc_submissions mime columns:', cols.map((c) => c.column_name).join(', ') || 'MISSING');

  const blobTable = await pg<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'kyc_submission_files'
    ) AS exists
  `;
  console.log(
    'kyc_submission_files table:',
    blobTable[0]?.exists ? 'STILL EXISTS (bad)' : 'dropped (good)',
  );

  // Recent KYC logs
  const kycLogs = await db
    .select()
    .from(appLogs)
    .where(
      or(
        ilike(appLogs.message, '%KYC%'),
        ilike(appLogs.message, '%Blob%'),
      ),
    )
    .orderBy(desc(appLogs.createdAt))
    .limit(40);

  const prodKycErrors = await pg<
    { id: string; level: string; message: string; meta: unknown; created_at: Date }[]
  >`
    SELECT id, level, message, meta, created_at
    FROM app_logs
    WHERE level = 'error'
      AND (message ILIKE '%KYC%' OR message ILIKE '%Blob%')
      AND meta->>'environment' = 'production'
      AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 30
  `;

  console.log(`\n=== Production KYC errors (24h): ${prodKycErrors.length} ===`);
  for (const row of prodKycErrors) {
    console.log(`\n--- ERROR ${row.created_at.toISOString()} ---`);
    console.log(row.message);
    console.log(JSON.stringify(row.meta, null, 2));
  }

  const prodKycAll = await pg<
    { level: string; message: string; meta: unknown; created_at: Date }[]
  >`
    SELECT level, message, meta, created_at
    FROM app_logs
    WHERE message ILIKE '%KYC%'
      AND meta->>'environment' = 'production'
      AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 50
  `;
  console.log(`\n=== Production KYC logs (24h): ${prodKycAll.length} ===`);
  for (const row of prodKycAll.slice(0, 25)) {
    console.log(`[${row.level}] ${row.created_at.toISOString()} ${row.message}`);
    if (row.level === 'error') {
      console.log('  ', JSON.stringify(row.meta).slice(0, 600));
    }
  }

  const recentErrors = kycLogs.filter(
    (l) => l.level === 'error' && l.createdAt >= since,
  );
  const recentAll = kycLogs.filter((l) => l.createdAt >= since);

  console.log(`\nKYC-related logs (last hour, any env): ${recentAll.length}`);
  for (const row of recentAll.slice(0, 20)) {
    console.log(
      `\n[${row.level}] ${row.createdAt.toISOString()} ${row.message}`,
    );
    if (row.meta && Object.keys(row.meta as object).length) {
      console.log('  meta:', JSON.stringify(row.meta, null, 0).slice(0, 500));
    }
  }

  console.log(`\nKYC errors (last hour): ${recentErrors.length}`);
  for (const row of recentErrors) {
    console.log(`\n--- ERROR ${row.createdAt.toISOString()} ---`);
    console.log(row.message);
    console.log(JSON.stringify(row.meta, null, 2));
  }

  // Latest kyc submissions
  const subs = await pg<
    {
      id: string;
      created_at: string;
      aadhaar_front_path: string;
      aadhaar_front_mime: string | null;
      status: string;
    }[]
  >`
    SELECT id, created_at, aadhaar_front_path, aadhaar_front_mime, status
    FROM kyc_submissions
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log('\nLatest kyc_submissions:');
  for (const s of subs) {
    const pathPreview = s.aadhaar_front_path?.slice(0, 80) ?? '';
    console.log(
      `  ${s.created_at} ${s.status} mime=${s.aadhaar_front_mime ?? 'null'} path=${pathPreview}`,
    );
  }

  // Blob env (local check only — production vars not visible here)
  console.log('\nLocal Blob private configured:', isBlobPrivateConfigured());

  await closeDb();
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
