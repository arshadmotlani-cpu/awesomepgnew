import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { depositDuePaiseFromLedger } from '@/src/lib/deposits/depositLedgerReconciliation';

describe('depositLedgerReconciliation', () => {
  it('depositDuePaiseFromLedger returns zero when collected meets required', () => {
    assert.equal(depositDuePaiseFromLedger({ requiredPaise: 412_080, collectedPaise: 412_080 }), 0);
  });

  it('depositDuePaiseFromLedger returns remainder when partially collected', () => {
    assert.equal(
      depositDuePaiseFromLedger({ requiredPaise: 412_080, collectedPaise: 205_900 }),
      206_180,
    );
  });

  it('depositDuePaiseFromLedger never returns negative', () => {
    assert.equal(
      depositDuePaiseFromLedger({ requiredPaise: 100_000, collectedPaise: 150_000 }),
      0,
    );
  });
});
