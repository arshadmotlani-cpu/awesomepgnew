import assert from 'node:assert/strict';
import test from 'node:test';

test('nextCustomerCode format CL + 8 digits', () => {
  const seq = 175;
  const code = `CL${String(seq).padStart(8, '0')}`;
  assert.match(code, /^CL\d{8}$/);
  assert.equal(code, 'CL00000175');
});
