import { describe, expect, it } from 'vitest';
import {
  hairPublicToInternal,
  isHairHost,
  isHairProtectedPath,
  isHairPublicPath,
} from '../../../src/hair/lib/host';

describe('For Your Hair host helpers', () => {
  it('detects foryourhair hosts', () => {
    expect(isHairHost('foryourhair.awesomepg.in')).toBe(true);
    expect(isHairHost('foryourhair.localhost')).toBe(true);
    expect(isHairHost('invest.awesomepg.in')).toBe(false);
    expect(isHairHost('www.awesomepg.in')).toBe(false);
  });

  it('maps public paths to /fyh internals', () => {
    expect(hairPublicToInternal('/login')).toBe('/fyh/auth/login');
    expect(hairPublicToInternal('/dashboard')).toBe('/fyh/dashboard');
    expect(hairPublicToInternal('/customers/1')).toBe('/fyh/customers/1');
    expect(hairPublicToInternal('/admin')).toBeNull();
  });

  it('protects app modules but not login', () => {
    expect(isHairProtectedPath('/dashboard')).toBe(true);
    expect(isHairProtectedPath('/login')).toBe(false);
    expect(isHairPublicPath('/billing')).toBe(true);
    expect(isHairPublicPath('/assets')).toBe(false);
  });
});
