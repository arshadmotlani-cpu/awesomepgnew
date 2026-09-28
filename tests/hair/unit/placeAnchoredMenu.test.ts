import assert from 'node:assert/strict';
import test from 'node:test';
import { placeAnchoredMenu } from '@/src/hair/lib/ui/placeAnchoredMenu';

const viewport = { viewportWidth: 1200, viewportHeight: 800 };

test('right-aligns the menu to the trigger and opens below when there is room', () => {
  const pos = placeAnchoredMenu({
    trigger: { top: 100, right: 400, bottom: 128, left: 372 },
    menuWidth: 176,
    menuHeight: 180,
    ...viewport,
  });
  assert.equal(pos.left, 400 - 176);
  assert.equal(pos.top, 128 + 4);
});

test('flips above the trigger when the row is near the bottom', () => {
  const pos = placeAnchoredMenu({
    trigger: { top: 720, right: 400, bottom: 748, left: 372 },
    menuWidth: 176,
    menuHeight: 180,
    ...viewport,
  });
  assert.equal(pos.top, 720 - 4 - 180);
  assert.ok(pos.top + 180 <= 800 - 8);
});

test('keeps the menu inside the viewport when the trigger is at the right edge', () => {
  const pos = placeAnchoredMenu({
    trigger: { top: 200, right: 1190, bottom: 228, left: 1162 },
    menuWidth: 176,
    menuHeight: 180,
    ...viewport,
  });
  assert.ok(pos.left >= 8);
  assert.ok(pos.left + 176 <= 1200 - 8);
  assert.equal(pos.left, 1190 - 176);
});

test('clamps upward when there is not enough room above or below', () => {
  const pos = placeAnchoredMenu({
    trigger: { top: 20, right: 200, bottom: 48, left: 172 },
    menuWidth: 176,
    menuHeight: 400,
    viewportWidth: 400,
    viewportHeight: 200,
  });
  assert.equal(pos.top, 8);
  assert.ok(pos.left >= 8);
  assert.ok(pos.left + 176 <= 400 - 8);
});
