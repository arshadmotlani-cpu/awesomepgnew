import 'dotenv/config';
import { runPricingHealthAudit } from '../src/services/pricingHealthAudit';

async function main() {
  const report = await runPricingHealthAudit();
  console.log('\n=== PRICING HEALTH REPORT ===\n');
  for (const s of report.sections) {
    console.log(`[${s.pass ? 'PASS' : 'FAIL'}] ${s.name}: ${s.summary}`);
    for (const d of s.details) console.log(`    ${d}`);
  }
  console.log(`\n=== OVERALL: ${report.allPass ? 'PASS' : 'FAIL'} ===\n`);
  process.exit(report.allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
