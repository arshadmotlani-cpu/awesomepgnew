import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allocateUniqueOrgSlug,
  isReservedOrgSlug,
  slugifySalonName,
} from '@/src/platform/lib/orgSlug';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('slugifySalonName', () => {
  it('lowercases and hyphenates', () => {
    assert.equal(slugifySalonName('Glow Salon'), 'glow-salon');
    assert.equal(slugifySalonName('  Glow  Salon! '), 'glow-salon');
  });
});

describe('allocateUniqueOrgSlug', () => {
  it('two colliding salon names get distinct slugs; display names unchanged', async () => {
    const taken = new Set<string>();
    const a = await allocateUniqueOrgSlug({
      salonName: 'Glow Salon',
      isTaken: async (s) => taken.has(s),
    });
    taken.add(a);
    const b = await allocateUniqueOrgSlug({
      salonName: 'Glow  Salon!',
      isTaken: async (s) => taken.has(s),
    });
    taken.add(b);
    assert.equal(a, 'glow-salon');
    assert.equal(b, 'glow-salon-2');
    assert.notEqual(a, b);
  });

  it('reserved word "App" still allocates via fallback', async () => {
    assert.equal(isReservedOrgSlug('app'), true);
    const slug = await allocateUniqueOrgSlug({
      salonName: 'App',
      isTaken: async () => false,
    });
    assert.equal(slug, 'salon');
  });

  it('reserved base that is taken falls back to salon-2', async () => {
    const slug = await allocateUniqueOrgSlug({
      salonName: 'App',
      isTaken: async (s) => s === 'salon',
    });
    assert.equal(slug, 'salon-2');
  });
});

describe('onboarding UX copy', () => {
  it('wizard has no subdomain/URL wording and no slug field label', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/platform/components/onboarding/OrganizationOnboardingWizard.tsx'),
      'utf8',
    );
    assert.match(src, /Salon name/);
    assert.doesNotMatch(src, /subdomain/i);
    assert.doesNotMatch(src, /web address/i);
    assert.doesNotMatch(src, />\s*Slug\s*</);
  });
});
