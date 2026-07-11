import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCapitalAllowedPath,
  isCapitalHost,
  isCapitalHostFromHeaders,
  isPgPath,
  resolveRequestHostname,
} from '../../../src/capital/lib/host';

describe('capital host routing', () => {
  it('detects capital host', () => {
    assert.equal(isCapitalHost('invest.awesomepg.in'), true);
    assert.equal(isCapitalHost('www.awesomepg.in'), false);
  });

  it('prefers x-forwarded-host when present', () => {
    const headers = new Headers({
      host: 'awesomepg-k59k.vercel.app',
      'x-forwarded-host': 'invest.awesomepg.in',
    });
    assert.equal(resolveRequestHostname(headers), 'invest.awesomepg.in');
    assert.equal(isCapitalHostFromHeaders(headers), true);
  });

  it('falls back to host header', () => {
    const headers = new Headers({ host: 'invest.awesomepg.in' });
    assert.equal(isCapitalHostFromHeaders(headers), true);
  });

  it('blocks PG paths conceptually', () => {
    assert.equal(isPgPath('/admin/dashboard'), true);
    assert.equal(isPgPath('/dashboard'), false);
    assert.equal(isPgPath('/pgs'), true);
    assert.equal(isPgPath('/guide'), true);
  });

  it('allowlists only capital paths', () => {
    assert.equal(isCapitalAllowedPath('/'), true);
    assert.equal(isCapitalAllowedPath('/login'), true);
    assert.equal(isCapitalAllowedPath('/dashboard'), true);
    assert.equal(isCapitalAllowedPath('/api/capital/health'), true);
    assert.equal(isCapitalAllowedPath('/pgs'), false);
    assert.equal(isCapitalAllowedPath('/admin'), false);
    assert.equal(isCapitalAllowedPath('/guide'), false);
  });
});
