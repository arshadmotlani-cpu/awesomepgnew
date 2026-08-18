/**
 * FYHAIR global appearance system tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  FYH_DEFAULT_APPEARANCE,
  FYH_APPEARANCE_STORAGE_KEY,
  parseFyhAppearanceJson,
  isFyhAccentId,
  isFyhThemeMode,
} from '@/src/hair/lib/appearance';

const root = process.cwd();

test('default appearance is dark + cyan', () => {
  assert.deepEqual(FYH_DEFAULT_APPEARANCE, { theme: 'dark', accent: 'cyan' });
});

test('parseFyhAppearanceJson accepts valid payload', () => {
  const parsed = parseFyhAppearanceJson(
    JSON.stringify({ theme: 'light', accent: 'purple' }),
  );
  assert.deepEqual(parsed, { theme: 'light', accent: 'purple' });
});

test('parseFyhAppearanceJson rejects invalid theme', () => {
  assert.equal(parseFyhAppearanceJson(JSON.stringify({ theme: 'neon' })), null);
});

test('accent and theme validators', () => {
  assert.equal(isFyhThemeMode('dark'), true);
  assert.equal(isFyhThemeMode('light'), true);
  assert.equal(isFyhThemeMode('system'), false);
  assert.equal(isFyhAccentId('pink'), true);
  assert.equal(isFyhAccentId('magenta'), false);
});

test('globals.css dark theme uses dark panel surfaces not white cards', () => {
  const css = readFileSync(join(root, 'src/hair/styles/globals.css'), 'utf8');
  assert.match(css, /--fyh-bg-panel:\s*var\(--fyh-surface-elevated\)/);
  assert.doesNotMatch(css, /--fyh-bg-panel:\s*#f4f7fb/);
  assert.match(css, /--fyh-text-on-panel:\s*#f1f5f9/);
});

test('appearance accent presets defined for all accents', () => {
  const css = readFileSync(join(root, 'src/hair/styles/appearance-accents.css'), 'utf8');
  for (const accent of ['cyan', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green']) {
    assert.match(css, new RegExp(`\\[data-fyh-accent='${accent}'\\]`));
  }
});

test('HairProviders persists unified appearance key', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/HairProviders.tsx'),
    'utf8',
  );
  assert.match(src, /persistFyhAppearance/);
  assert.match(src, /applyFyhAppearanceToDocument/);
  assert.match(src, /setAccent/);
});

test('Settings includes Appearance section', () => {
  const nav = readFileSync(
    join(root, 'src/hair/components/settings/SettingsNav.tsx'),
    'utf8',
  );
  assert.match(nav, /\/settings\/appearance/);
  const panel = readFileSync(
    join(root, 'src/hair/components/settings/AppearanceSettingsPanel.tsx'),
    'utf8',
  );
  assert.match(panel, /Accent colour/);
  assert.match(panel, /Preview/);
});

test('appointment modal still has no chair and uses picker scroll', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/appointments/AppointmentCreateModal.tsx'),
    'utf8',
  );
  assert.doesNotMatch(src, /Chair/);
  assert.match(src, /fyh-picker-dropdown/);
  assert.match(src, /fyh-panel-financial/);
});

test('appearance storage key is fyh-appearance', () => {
  assert.equal(FYH_APPEARANCE_STORAGE_KEY, 'fyh-appearance');
});

test('blocking script sets data-fyh-accent', () => {
  const src = readFileSync(join(root, 'src/hair/lib/appearance.ts'), 'utf8');
  assert.match(src, /data-fyh-accent/);
  assert.match(src, /fyh-theme-light/);
});
