/* eslint-disable no-console */
/**
 * Run June 2026 electricity integrity repair on production (after deploy).
 *
 *   DOTENV_CONFIG_PATH=.env.production.runtime npx tsx scripts/run-production-june-electricity-integrity-repair.ts
 *   DOTENV_CONFIG_PATH=.env.production.runtime npx tsx scripts/run-production-june-electricity-integrity-repair.ts --execute
 */
import dotenv from 'dotenv';

if (process.env.DOTENV_CONFIG_PATH) {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH, override: true });
} else {
  dotenv.config({ path: '.env.production.runtime', override: true });
}

async function main() {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error('CRON_SECRET not set');
    process.exit(1);
  }

  const execute = process.argv.includes('--execute');
  const dryRun = execute ? 'false' : 'true';
  const pg = process.argv.find((a) => a.startsWith('--pg='))?.split('=')[1] ?? 'shanti';
  const path = `/api/cron/june-electricity-integrity-repair?dryRun=${dryRun}&pg=${encodeURIComponent(pg)}`;

  for (let i = 0; i < 15; i++) {
    const res = await fetch(`https://www.awesomepg.in${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    });
    const text = await res.text();
    if (res.status !== 404) {
      console.log(`READY attempt ${i + 1} HTTP ${res.status}`);
      try {
        const body = JSON.parse(text) as {
          ok?: boolean;
          overallPass?: boolean;
          certification?: string;
        };
        if (body.certification) {
          console.log('\n' + body.certification);
        } else {
          console.log(JSON.stringify(body, null, 2));
        }
      } catch {
        console.log(text.slice(0, 8000));
      }
      process.exit(res.ok ? 0 : 1);
    }
    console.log(`attempt ${i + 1}: 404 (deploy pending)`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  console.error('Timed out waiting for production deploy');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
