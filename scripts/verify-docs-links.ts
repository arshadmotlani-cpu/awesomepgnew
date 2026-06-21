#!/usr/bin/env tsx
/**
 * Verify Obsidian [[wiki links]] in docs/ resolve to existing .md files.
 * Exit 1 if any target is missing.
 *
 * Usage: npx tsx scripts/verify-docs-links.ts
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const DOCS = join(import.meta.dirname, '..', 'docs');

const SKIP_TARGETS = new Set(['Wiki Links', 'Note Name']);

function listMdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMdFiles(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function resolveTarget(target: string, known: Set<string>): boolean {
  if (SKIP_TARGETS.has(target)) return true;
  if (known.has(target)) return true;
  // Allow section-only refs on known files handled above; file must exist
  return false;
}

const mdFiles = listMdFiles(DOCS);
const known = new Set<string>();
for (const f of mdFiles) {
  known.add(basename(f, '.md'));
}

const linkRe = /\[\[([^\]|#]+)(?:#[^\]]+)?\]\]/g;
const missing: { file: string; target: string }[] = [];
const seen = new Set<string>();

for (const file of mdFiles) {
  const rel = file.replace(DOCS + '/', 'docs/');
  const content = readFileSync(file, 'utf8');
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(content)) !== null) {
    const target = m[1]!.trim();
    const key = `${rel}→${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!resolveTarget(target, known)) {
      missing.push({ file: rel, target });
    }
  }
}

if (missing.length === 0) {
  console.log(`[docs-links] OK — ${seen.size} unique wiki links, ${known.size} notes`);
  process.exit(0);
}

console.error(`[docs-links] ${missing.length} unresolved target(s):\n`);
for (const { file, target } of missing.sort((a, b) => a.target.localeCompare(b.target))) {
  console.error(`  [[${target}]]  ←  ${file}`);
}
process.exit(1);
