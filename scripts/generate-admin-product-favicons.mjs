/**
 * @deprecated Use `node scripts/generate-admin-product-logos.mjs` instead.
 * Re-exports favicon masters and runs favicon-only generation for backwards compatibility.
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export { ADMIN_FAVICON_MASTERS } from './generate-admin-product-logos.mjs';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const logosPath = join(dirname(fileURLToPath(import.meta.url)), 'generate-admin-product-logos.mjs');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [logosPath, '--favicons-only'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
