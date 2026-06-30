/* eslint-disable no-console */
/**
 * Regression guard: never render private Vercel Blob URLs directly in JSX img/Image src.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'src/components'];

const PRIVATE_HOST = 'private.blob.vercel-storage.com';

/** Allowlisted patterns — proxy URL builders, not render sites. */
const ALLOWLIST = [
  /blobImageDisplay\.ts$/,
  /blob\.ts$/,
  /proofResponse\.ts$/,
  /checkoutSettlementImages\.ts$/,
  /screenshotUpload\.ts$/,
  /kyc\/storage\.ts$/,
  /loadKycImageBytes\.ts$/,
  /\.test\.ts$/,
];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      collectFiles(full, out);
    } else if (/\.(tsx|jsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function isAllowlisted(path: string): boolean {
  return ALLOWLIST.some((re) => re.test(path));
}

function main() {
  const violations: string[] = [];

  for (const dir of SCAN_DIRS) {
    for (const file of collectFiles(join(ROOT, dir))) {
      const rel = relative(ROOT, file);
      if (isAllowlisted(rel)) continue;
      const text = readFileSync(file, 'utf8');
      if (!text.includes(PRIVATE_HOST)) continue;

      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (!line.includes(PRIVATE_HOST)) return;
        if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) return;
        violations.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
  }

  console.log('\n=== Private blob display lint ===\n');

  if (!violations.length) {
    console.log('✓ No private.blob.vercel-storage.com literals in JSX render trees.\n');
    return;
  }

  for (const v of violations) {
    console.error(`✗ ${v}`);
  }
  console.error(
    `\n${violations.length} violation(s). Private blobs must use authenticated proxy URLs.\n`,
  );
  process.exit(1);
}

main();
