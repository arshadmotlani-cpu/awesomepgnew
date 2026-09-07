import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discountBpsFromWholePercent,
  normalizeDiscountPercentOnBlur,
  overridePricePaiseForDiscountPercent,
  parseDiscountPercentDraft,
  parseWholeDiscountPercent,
  wholeDiscountPercentFromBps,
} from '@/src/hair/lib/quickSaleDiscountPercent';
import { discountPaiseFromBps } from '@/src/hair/lib/attributionMath';

type EditState = { draft: string; committed: number };

function applyChange(state: EditState, raw: string): EditState {
  const parsed = parseDiscountPercentDraft(raw);
  const next: EditState = { draft: raw, committed: state.committed };
  if (parsed.status === 'valid') {
    next.committed = parsed.percent;
  }
  return next;
}

function applyBlur(state: EditState): EditState {
  const normalized = normalizeDiscountPercentOnBlur(state.draft, state.committed);
  return { draft: String(normalized), committed: normalized };
}

test('discount edit flow: initial 1%', () => {
  const state = applyChange({ draft: '1', committed: 1 }, '1');
  assert.equal(state.draft, '1');
  assert.equal(state.committed, 1);
});

test('discount edit flow: backspace allows empty draft without reverting display', () => {
  let state: EditState = { draft: '1', committed: 1 };
  state = applyChange(state, '');
  assert.equal(state.draft, '');
  assert.equal(state.committed, 1, 'basket stays until blur or valid commit');
});

test('discount edit flow: type 0 from empty commits 0%', () => {
  let state: EditState = { draft: '', committed: 1 };
  state = applyChange(state, '0');
  assert.equal(state.draft, '0');
  assert.equal(state.committed, 0);
});

test('discount edit flow: type 15 commits 15%', () => {
  let state: EditState = { draft: '1', committed: 1 };
  state = applyChange(state, '15');
  assert.equal(state.draft, '15');
  assert.equal(state.committed, 15);
});

test('discount edit flow: type 100 commits 100%', () => {
  let state: EditState = { draft: '10', committed: 10 };
  state = applyChange(state, '100');
  assert.equal(state.draft, '100');
  assert.equal(state.committed, 100);
});

test('discount edit flow: values above 100 are rejected until blur revert', () => {
  let state: EditState = { draft: '10', committed: 10 };
  state = applyChange(state, '101');
  assert.equal(state.draft, '101');
  assert.equal(state.committed, 10, 'invalid draft does not change committed percent');
  state = applyBlur(state);
  assert.equal(state.draft, '10');
  assert.equal(state.committed, 10);
});

test('discount edit flow: blur on empty normalizes to 0%', () => {
  let state: EditState = { draft: '1', committed: 1 };
  state = applyChange(state, '');
  state = applyBlur(state);
  assert.equal(state.draft, '0');
  assert.equal(state.committed, 0);
});

test('overridePricePaiseForDiscountPercent matches existing bps math', () => {
  const catalogGross = 100_000;
  for (const pct of [0, 1, 15, 100]) {
    const bps = discountBpsFromWholePercent(pct);
    const expected = Math.max(0, catalogGross - discountPaiseFromBps(catalogGross, bps));
    assert.equal(overridePricePaiseForDiscountPercent(catalogGross, pct), expected);
  }
});

test('whole-number parser still rejects decimals', () => {
  assert.equal(parseWholeDiscountPercent('1.5'), null);
  assert.equal(parseDiscountPercentDraft('2.75').status, 'invalid');
});

test('wholeDiscountPercentFromBps preserves 0%', () => {
  assert.equal(wholeDiscountPercentFromBps(0), 0);
  assert.equal(wholeDiscountPercentFromBps(100), 1);
});
