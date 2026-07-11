import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '../../../middleware';

function req(path: string, host: string) {
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

describe('root middleware PG host isolation', () => {
  it('www.awesomepg.in /dashboard returns 404', () => {
    const res = middleware(req('/dashboard', 'www.awesomepg.in'));
    assert.equal(res.status, 404);
  });

  it('www.awesomepg.in /admin/login is not blocked by capital guard', () => {
    const res = middleware(req('/admin/login', 'www.awesomepg.in'));
    assert.notEqual(res.status, 404);
  });

  it('awesomepg.in /assets returns 404', () => {
    const res = middleware(req('/assets', 'awesomepg.in'));
    assert.equal(res.status, 404);
  });

  it('invest.awesomepg.in /admin returns 404', () => {
    const res = middleware(req('/admin', 'invest.awesomepg.in'));
    assert.equal(res.status, 404);
  });

  it('invest.awesomepg.in /pgs returns 404', () => {
    const res = middleware(req('/pgs', 'invest.awesomepg.in'));
    assert.equal(res.status, 404);
  });

  it('invest.awesomepg.in / redirects to login', () => {
    const res = middleware(req('/', 'invest.awesomepg.in'));
    assert.equal(res.status, 307);
    assert.ok(res.headers.get('location')?.includes('/login'));
  });

  it('www.awesomepg.in /api/capital/search returns 404', () => {
    const res = middleware(req('/api/capital/search', 'www.awesomepg.in'));
    assert.equal(res.status, 404);
  });

  it('www.awesomepg.in /api/capital/export/ledger returns 404', () => {
    const res = middleware(req('/api/capital/export/ledger', 'www.awesomepg.in'));
    assert.equal(res.status, 404);
  });
});
