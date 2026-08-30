import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertHairIntegrationTestWritesAllowed,
  isDedicatedHairTestDatabaseUrl,
  isHairIntegrationTestRunner,
  isProductionHairDatabaseUrl,
} from '@/src/hair/lib/db/integrationWriteGuard';
import {
  PRODUCTION_HAIR_HOST_FRAGMENT,
  STAGING_HAIR_HOST_FRAGMENT,
} from '@/src/lib/db/loadProductionCutoverEnv';

const PROD_URL = `postgresql://u:p@${PRODUCTION_HAIR_HOST_FRAGMENT}-pooler.example/neondb`;
const STAGING_URL = `postgresql://u:p@${STAGING_HAIR_HOST_FRAGMENT}-pooler.example/neondb`;
const OTHER_URL = 'postgresql://u:p@ep-other-branch.example/neondb';

describe('hair integration write guard', () => {
  it('detects production and staging Hair hosts', () => {
    assert.equal(isProductionHairDatabaseUrl(PROD_URL), true);
    assert.equal(isProductionHairDatabaseUrl(STAGING_URL), false);
    assert.equal(isDedicatedHairTestDatabaseUrl(STAGING_URL), true);
    assert.equal(isDedicatedHairTestDatabaseUrl(PROD_URL), false);
  });

  it('detects node test runner via argv', () => {
    const prev = process.argv;
    process.argv = [...process.argv, 'tests/hair/integration/vendorBrain.test.ts'];
    try {
      assert.equal(isHairIntegrationTestRunner(), true);
    } finally {
      process.argv = prev;
    }
  });

  it('blocks integration tests against production even with HAIR_ALLOW_INTEGRATION_WRITES', () => {
    const prevNode = process.env.NODE_ENV;
    const prevUrl = process.env.HAIR_DATABASE_URL;
    const prevAllow = process.env.HAIR_ALLOW_INTEGRATION_WRITES;
    const prevArgv = process.argv;
    process.env.NODE_ENV = 'test';
    process.argv = [...process.argv, '--test'];
    process.env.HAIR_DATABASE_URL = PROD_URL;
    process.env.HAIR_ALLOW_INTEGRATION_WRITES = '1';
    try {
      assert.throws(
        () => assertHairIntegrationTestWritesAllowed(),
        /Refusing Hair integration test writes against production/,
      );
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevUrl === undefined) delete process.env.HAIR_DATABASE_URL;
      else process.env.HAIR_DATABASE_URL = prevUrl;
      if (prevAllow === undefined) delete process.env.HAIR_ALLOW_INTEGRATION_WRITES;
      else process.env.HAIR_ALLOW_INTEGRATION_WRITES = prevAllow;
    }
  });

  it('allows integration tests on staging Hair database', () => {
    const prevNode = process.env.NODE_ENV;
    const prevUrl = process.env.HAIR_DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.HAIR_DATABASE_URL = STAGING_URL;
    try {
      assert.doesNotThrow(() => assertHairIntegrationTestWritesAllowed());
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevUrl === undefined) delete process.env.HAIR_DATABASE_URL;
      else process.env.HAIR_DATABASE_URL = prevUrl;
    }
  });

  it('requires explicit HAIR_TEST_DATABASE_URL for unknown non-production hosts', () => {
    const prevNode = process.env.NODE_ENV;
    const prevUrl = process.env.HAIR_DATABASE_URL;
    const prevTest = process.env.HAIR_TEST_DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.HAIR_DATABASE_URL = OTHER_URL;
    delete process.env.HAIR_TEST_DATABASE_URL;
    try {
      assert.throws(
        () => assertHairIntegrationTestWritesAllowed(),
        /require a dedicated test database/,
      );
      process.env.HAIR_TEST_DATABASE_URL = OTHER_URL;
      assert.doesNotThrow(() => assertHairIntegrationTestWritesAllowed());
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevUrl === undefined) delete process.env.HAIR_DATABASE_URL;
      else process.env.HAIR_DATABASE_URL = prevUrl;
      if (prevTest === undefined) delete process.env.HAIR_TEST_DATABASE_URL;
      else process.env.HAIR_TEST_DATABASE_URL = prevTest;
    }
  });
});
