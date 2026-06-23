/* eslint-disable no-console */
/**
 * Static regression guard: no capture= on file inputs, no raw `<input type="file">`.
 */
import {
  scanSourcesForCaptureViolations,
  scanSourcesForRawFileInputViolations,
} from '../src/lib/uploads/fileInputPolicy';
import { collectUploadPolicySources } from '../src/lib/uploads/scanUploadSources';

function main() {
  const sources = collectUploadPolicySources();
  const captureViolations = scanSourcesForCaptureViolations(sources);
  const rawInputViolations = scanSourcesForRawFileInputViolations(sources);
  const violations = [...captureViolations, ...rawInputViolations];

  console.log('\n=== Image upload policy lint ===\n');
  console.log(`Scanned ${sources.length} files under app/ and src/`);

  if (!violations.length) {
    console.log('✓ No capture= attributes or raw file inputs found.\n');
    return;
  }

  for (const v of violations) {
    console.error(`✗ ${v}`);
  }
  console.error(`\n${violations.length} violation(s). Use ImageFileInput — never set capture.\n`);
  process.exit(1);
}

main();
