import assert from 'node:assert/strict';
import test from 'node:test';
import { inferQuickSaleCustomerPrefill } from '@/src/hair/lib/quickSaleCustomerPrefill';

test('prefill digits-heavy search as phone', () => {
  assert.deepEqual(inferQuickSaleCustomerPrefill('9876543210'), {
    fullName: '',
    phone: '9876543210',
  });
  assert.deepEqual(inferQuickSaleCustomerPrefill('+91 98765 43210'), {
    fullName: '',
    phone: '9876543210',
  });
});

test('prefill name-like search as full name', () => {
  assert.deepEqual(inferQuickSaleCustomerPrefill('Priya Sharma'), {
    fullName: 'Priya Sharma',
    phone: '',
  });
});

test('prefill customer code search as name', () => {
  assert.deepEqual(inferQuickSaleCustomerPrefill('CL00000175'), {
    fullName: 'CL00000175',
    phone: '',
  });
});
