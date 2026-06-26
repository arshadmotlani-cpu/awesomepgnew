import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPublicPgPresentation,
  resolvePublicPgDisplayName,
  sortPublicPgs,
} from '../../src/lib/publicPgPresentation';

test('resolvePublicPgDisplayName renames Trimurti to IT PARK', () => {
  assert.equal(
    resolvePublicPgDisplayName({
      name: 'Trimurti Nagar',
      slug: 'trimurti-nagar-awesome-pg',
    }),
    'IT PARK',
  );
});

test('resolvePublicPgDisplayName prefers DB public_display_name', () => {
  assert.equal(
    resolvePublicPgDisplayName({
      name: 'Trimurti Nagar',
      slug: 'trimurti-nagar-awesome-pg',
      publicDisplayName: 'IT PARK PG',
    }),
    'IT PARK PG',
  );
});

test('sortPublicPgs orders IT PARK, Shantinagar, Central Avenue', () => {
  const rows = [
    applyPublicPgPresentation({
      name: 'CENTRAL - AWESOME PG',
      slug: 'central-awesome-pg',
    }),
    applyPublicPgPresentation({
      name: 'SHANTINAGAR - AWESOME PG',
      slug: 'shantinagar-awesome-pg',
    }),
    applyPublicPgPresentation({
      name: 'Trimurti Nagar',
      slug: 'trimurti-nagar-awesome-pg',
    }),
  ];

  const sorted = sortPublicPgs(rows);
  assert.deepEqual(
    sorted.map((r) => r.name),
    ['IT PARK', 'SHANTINAGAR - AWESOME PG', 'CENTRAL AVENUE - AWESOME PG'],
  );
});
