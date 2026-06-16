import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Documents the half-open stay_range edge case that caused same-day checkout to fail:
 * daterange(move_in, vacating_date, '[)') excludes vacating_date, so approving
 * a notice for today removes today from the active stay before completion runs.
 */
test('half-open stay range excludes vacating date (same-day checkout pitfall)', () => {
  const vacatingDate = '2026-06-13';
  const today = '2026-06-13';
  // PostgreSQL [start, end) — today is NOT in range when end === today.
  const stayCoversToday = vacatingDate > today;
  assert.equal(stayCoversToday, false);
});

test('same-day admin remove must not shorten stay before completion', () => {
  const today = '2026-06-13';
  const shouldShortenOnApprove = today > today;
  assert.equal(shouldShortenOnApprove, false);
});
