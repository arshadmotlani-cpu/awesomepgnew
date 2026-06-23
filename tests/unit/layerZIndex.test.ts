import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYER_Z } from '../../src/lib/ui/layerZIndex';

test('nested overlay z-index sits above bottom sheet panel', () => {
  assert.ok(LAYER_Z.nestedOverlay > LAYER_Z.bottomSheetPanel);
  assert.ok(LAYER_Z.nestedDialog > LAYER_Z.nestedOverlay);
  assert.ok(LAYER_Z.bottomSheetPanel > LAYER_Z.bottomSheetOverlay);
});

test('bottom sheet and nested layers use distinct high stacking values', () => {
  assert.equal(LAYER_Z.bottomSheetPanel, 99_999);
  assert.equal(LAYER_Z.nestedDialog, 100_001);
});
