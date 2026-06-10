import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression: Next.js loads instrumentation in the Edge runtime where
 * `process.argv` is undefined. A top-level `import 'dotenv/config'` makes
 * dotenv's cli-options call `process.argv.reduce(...)` and crash every request.
 */
describe('startupMigrationGate edge safety', () => {
  it('loads without dotenv when process.argv is undefined (edge runtime)', async () => {
    const savedArgv = process.argv;
    const savedRuntime = process.env.NEXT_RUNTIME;
    try {
      process.argv = undefined as unknown as string[];
      process.env.NEXT_RUNTIME = 'edge';

      const mod = await import('../../src/db/startupMigrationGate');
      assert.equal(typeof mod.assertMigrationsAppliedForDev, 'function');

      // Edge runtime must no-op without touching dotenv or exiting.
      await mod.assertMigrationsAppliedForDev();
    } finally {
      process.argv = savedArgv;
      if (savedRuntime === undefined) {
        delete process.env.NEXT_RUNTIME;
      } else {
        process.env.NEXT_RUNTIME = savedRuntime;
      }
    }
  });
});
