/**
 * Import historical salon sales from Excel.
 * Usage: npm run hair:import:historical -- path/to/file.xlsx [--dry-run] [--force]
 */
import { readFile } from 'node:fs/promises';
import { loadAppEnv } from '../src/lib/db/loadEnv';

loadAppEnv();

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));
  if (!filePath) {
    console.error('Usage: npm run hair:import:historical -- <file.xlsx> [--dry-run] [--force]');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const buffer = await readFile(filePath);
  const fileName = filePath.split('/').pop() ?? 'import.xlsx';

  const { importHistoricalSales } = await import('../src/hair/services/historicalImport');
  const result = await importHistoricalSales({
    fileName,
    buffer,
    dryRun,
    force,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.summary.failed > 0 && result.summary.imported === 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
