import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeUserAgent } from '../../src/lib/auth/customerSessions';

describe('describeUserAgent', () => {
  it('returns Unknown device when user-agent is missing', () => {
    assert.equal(describeUserAgent(null), 'Unknown device');
    assert.equal(describeUserAgent(''), 'Unknown device');
  });

  it('parses common mobile and desktop browsers', () => {
    assert.equal(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
      'iPhone / iPad · Safari',
    );
    assert.equal(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      ),
      'Android · Chrome',
    );
    assert.equal(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      ),
      'Windows · Chrome',
    );
  });
});
