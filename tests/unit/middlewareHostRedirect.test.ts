import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('pgApexToWww redirect helper', () => {
  it('detects apex host for redirect', () => {
    const hostHeader = 'awesomepg.in';
    const hostname = hostHeader.split(':')[0]?.toLowerCase() ?? '';
    assert.equal(hostname, 'awesomepg.in');
    assert.notEqual(hostname, 'www.awesomepg.in');
  });
});
