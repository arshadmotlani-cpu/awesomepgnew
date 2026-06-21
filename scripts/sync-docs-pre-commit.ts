#!/usr/bin/env tsx
/**
 * Pre-commit doc sync — deterministic, no LLM.
 * Maps staged code paths → /docs files; updates CHANGELOG + CURRENT_STATE markers.
 *
 * Usage:
 *   tsx scripts/sync-docs-pre-commit.ts          # pre-commit (mutates + git add)
 *   tsx scripts/sync-docs-pre-commit.ts --check  # CI/dry-run (exit 1 if stale)
 *   tsx scripts/sync-docs-pre-commit.ts --dry-run
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DOCS = join(ROOT, 'docs');
const MAPPING_PATH = join(ROOT, 'scripts', 'doc-sync-mapping.json');

const PENDING_START = '<!-- DOC_SYNC_PENDING_START -->';
const PENDING_END = '<!-- DOC_SYNC_PENDING_END -->';
const STATE_START = '<!-- DOC_SYNC_STATE_START -->';
const STATE_END = '<!-- DOC_SYNC_STATE_END -->';

type Rule = {
  id: string;
  label: string;
  wiki: string;
  patterns: string[];
  docs: string[];
};

type Mapping = {
  rules: Rule[];
  alwaysUpdate: string[];
};

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const dryRun = args.has('--dry-run');

function git(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function loadMapping(): Mapping {
  return JSON.parse(readFileSync(MAPPING_PATH, 'utf8')) as Mapping;
}

function getStagedFiles(): string[] {
  try {
    return git('git diff --cached --name-only --diff-filter=ACMR')
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function matchesPattern(file: string, pattern: string): boolean {
  if (pattern.endsWith('/')) {
    return file.startsWith(pattern) || file.includes('/' + pattern.slice(0, -1) + '/');
  }
  return file === pattern || file.startsWith(pattern);
}

function matchRules(staged: string[], rules: Rule[]): { matchedRules: Rule[]; matchedFiles: string[] } {
  const matchedRules = new Map<string, Rule>();
  const matchedFiles: string[] = [];

  for (const file of staged) {
    if (file.startsWith('docs/')) continue;
    for (const rule of rules) {
      if (rule.patterns.some((p) => matchesPattern(file, p))) {
        matchedRules.set(rule.id, rule);
        matchedFiles.push(file);
        break;
      }
    }
  }

  return { matchedRules: [...matchedRules.values()], matchedFiles };
}

function isoNow(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}

function dateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureChangelog(): string {
  const path = join(DOCS, 'CHANGELOG.md');
  if (existsSync(path)) return path;

  const initial = `# Changelog

> Auto-maintained. Pre-commit hook appends **Pending** entries; move to dated sections when committing.

${PENDING_START}
${PENDING_END}

---

## History

_Entries moved here from Pending after review._

`;
  if (!dryRun && !checkOnly) writeFileSync(path, initial, 'utf8');
  return path;
}

function replaceBlock(content: string, start: string, end: string, block: string): string {
  const re = new RegExp(`${escapeReg(start)}[\\s\\S]*?${escapeReg(end)}`, 'm');
  if (re.test(content)) {
    return content.replace(re, `${start}\n${block}\n${end}`);
  }
  return content.trimEnd() + `\n\n${start}\n${block}\n${end}\n`;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPendingBlock(input: {
  areas: Rule[];
  flaggedDocs: Set<string>;
  stagedFiles: string[];
}): string {
  const wikiLinks = input.areas.map((r) => `[[${r.wiki}]]`).join(', ') || 'general';
  const docList = [...input.flaggedDocs].sort().map((d) => `- \`${d}\` — review for accuracy`).join('\n');
  const files = input.stagedFiles.slice(0, 25).map((f) => `- \`${f}\``).join('\n');
  const more =
    input.stagedFiles.length > 25
      ? `\n- _…and ${input.stagedFiles.length - 25} more staged files_`
      : '';

  return `### Pending pre-commit sync · ${isoNow()}

**Areas touched:** ${wikiLinks}

**Docs flagged for review:**
${docList || '- _(none — mapping gap?)_'}

**Staged code files (${input.stagedFiles.length}):**
${files}${more}

**Changed:**
- _(auto)_ Pre-commit doc sync — expand FEATURES/WORKFLOWS/DATABASE sections if behavior changed

**Fixed:**
- _(none — fill in if this commit fixes a bug)_

**Added:**
- _(none — fill in if this commit adds a feature)_

**Removed:**
- _(none)_`;
}

function buildStateBlock(input: {
  areas: Rule[];
  flaggedDocs: Set<string>;
  stagedCount: number;
}): string {
  const wikiLinks = input.areas.map((r) => `[[${r.wiki}]]`).join(', ') || '—';
  const docs = [...input.flaggedDocs].sort().join(', ') || '—';

  return `## Automated doc sync

> **Last sync:** ${isoNow()}  
> **Areas touched:** ${wikiLinks}  
> **Docs flagged:** ${docs}  
> **Staged code files:** ${input.stagedCount}  
> **Action:** Review [[CHANGELOG#Pending pre-commit sync · ${isoNow().slice(0, 10)}]] (Pending section) before push.`;
}

function updateFile(relPath: string, mutator: (content: string) => string): boolean {
  const full = join(DOCS, relPath);
  if (!existsSync(full)) {
    if (dryRun || checkOnly) return false;
    mkdirSync(DOCS, { recursive: true });
    writeFileSync(full, `# ${relPath.replace('.md', '')}\n\n> Created by doc sync hook — fill in content.\n`, 'utf8');
  }
  const before = readFileSync(full, 'utf8');
  const after = mutator(before);
  if (before === after) return false;
  if (!dryRun && !checkOnly) writeFileSync(full, after, 'utf8');
  return true;
}

function main(): number {
  const staged = getStagedFiles();
  const codeStaged = staged.filter((f) => !f.startsWith('docs/'));

  if (codeStaged.length === 0) {
    return 0;
  }

  const mapping = loadMapping();
  const { matchedRules, matchedFiles } = matchRules(staged, mapping.rules);

  if (matchedRules.length === 0) {
    return 0;
  }

  const flaggedDocs = new Set<string>(mapping.alwaysUpdate);
  for (const rule of matchedRules) {
    for (const doc of rule.docs) flaggedDocs.add(doc);
  }

  const pendingBlock = buildPendingBlock({
    areas: matchedRules,
    flaggedDocs,
    stagedFiles: matchedFiles.length > 0 ? matchedFiles : codeStaged,
  });

  const stateBlock = buildStateBlock({
    areas: matchedRules,
    flaggedDocs,
    stagedCount: codeStaged.length,
  });

  if (checkOnly) {
    const changelogPath = join(DOCS, 'CHANGELOG.md');
    const statePath = join(DOCS, 'CURRENT_STATE.md');
    const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';
    const hasPending = changelog.includes(PENDING_START);
    const state = existsSync(statePath) ? readFileSync(statePath, 'utf8') : '';
    const syncFresh = state.includes(isoNow().slice(0, 10));
    if (!hasPending && !syncFresh) {
      console.error('[docs-sync] Docs appear stale for staged changes. Run: npm run docs:sync');
      console.error(`  Areas: ${matchedRules.map((r) => r.id).join(', ')}`);
      return 1;
    }
    return 0;
  }

  ensureChangelog();

  let changed = false;

  changed =
    updateFile('CHANGELOG.md', (c) => replaceBlock(c, PENDING_START, PENDING_END, pendingBlock)) ||
    changed;

  changed =
    updateFile('CURRENT_STATE.md', (c) => {
      if (c.includes(STATE_START)) {
        return replaceBlock(c, STATE_START, STATE_END, stateBlock);
      }
      return c.trimEnd() + `\n\n${STATE_START}\n${stateBlock}\n${STATE_END}\n`;
    }) || changed;

  for (const doc of flaggedDocs) {
    if (doc === 'CHANGELOG.md' || doc === 'CURRENT_STATE.md') continue;
    const touched = updateFile(doc, (c) => {
      const marker = `<!-- DOC_SYNC_TOUCH_${dateOnly()} -->`;
      if (c.includes(marker)) return c;
      const note = `\n\n${marker}\n> **${isoNow()}** — Code changed in: ${matchedRules.map((r) => r.label).join(', ')}. Manual review recommended.\n`;
      return c.trimEnd() + note;
    });
    changed = touched || changed;
  }

  if (changed && !dryRun) {
    const toAdd = [...flaggedDocs].map((d) => `docs/${d}`).filter((p) => existsSync(join(ROOT, p)));
    if (toAdd.length > 0) {
      execSync(`git add ${toAdd.map((f) => JSON.stringify(f)).join(' ')}`, { cwd: ROOT });
    }
    console.log(`[docs-sync] Updated ${toAdd.join(', ')} (${matchedRules.map((r) => r.id).join(', ')})`);
  } else if (dryRun) {
    console.log(
      `[docs-sync] dry-run — would update: ${[...flaggedDocs].sort().join(', ')} (${matchedRules.map((r) => r.id).join(', ')})`,
    );
  }

  return 0;
}

process.exit(main());
