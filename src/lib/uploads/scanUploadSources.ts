import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Collect TypeScript sources under app/ and src/ for upload policy scans. */
export function collectUploadPolicySources(cwd = process.cwd()): Array<{ path: string; source: string }> {
  const entries: Array<{ path: string; source: string }> = [];

  function walk(absDir: string) {
    for (const ent of readdirSync(absDir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      const absPath = join(absDir, ent.name);
      if (ent.isDirectory()) {
        walk(absPath);
        continue;
      }
      const ext = ent.name.slice(ent.name.lastIndexOf('.'));
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      const rel = relative(cwd, absPath).replace(/\\/g, '/');
      entries.push({ path: rel, source: readFileSync(absPath, 'utf8') });
    }
  }

  for (const root of ['app', 'src']) {
    walk(join(cwd, root));
  }

  return entries;
}
