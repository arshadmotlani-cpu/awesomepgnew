/* eslint-disable no-console */
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
  const path = `/api/cron/booking-stay-date-integrity${execute ? '?execute=true' : ''}`;

  for (let i = 0; i < 15; i++) {
    const res = await fetch(`https://www.awesomepg.in${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const text = await res.text();
    if (res.status !== 404) {
      console.log(`READY attempt ${i + 1} HTTP ${res.status}`);
      try {
        console.log(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        console.log(text.slice(0, 4000));
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
