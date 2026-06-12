import assert from 'node:assert/strict';
import test from 'node:test';
import { sharingLabelForDisplay } from '../../src/lib/roomDisplay';

test('sharingLabelForDisplay uses capacity for generic sharing names', () => {
  assert.equal(sharingLabelForDisplay(2, '2 Sharing'), '2-sharing room');
  assert.equal(sharingLabelForDisplay(1, '1 Sharing'), 'Single room (1-sharing)');
});

test('sharingLabelForDisplay keeps custom room type labels', () => {
  assert.equal(
    sharingLabelForDisplay(2, 'Tuition room'),
    'Tuition room · 2-sharing',
  );
});
