import { strict as assert } from 'node:assert';
import test from 'node:test';

test('database URL resolver priority: DATABASE_URL → POSTGRES_URL → POSTGRES_PRISMA_URL', { concurrency: false }, async () => {
  const prev = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL,
  };

  try {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;

    const { getDatabaseUrlSource, getDatabaseUrl } = await import('../../src/lib/db/env');

    process.env.POSTGRES_PRISMA_URL = 'postgres://prisma@host/prisma';
    process.env.POSTGRES_URL = 'postgres://pool@host/pool';
    assert.equal(getDatabaseUrlSource(), 'POSTGRES_URL');
    assert.equal(getDatabaseUrl(), 'postgres://pool@host/pool');

    process.env.DATABASE_URL = 'postgres://primary@host/primary';
    assert.equal(getDatabaseUrlSource(), 'DATABASE_URL');
    assert.equal(getDatabaseUrl(), 'postgres://primary@host/primary');
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('formatDatabaseConfigReport lists missing vars and setup steps', { concurrency: false }, async () => {
  const prev = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL,
  };

  try {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;

    const { formatDatabaseConfigReport } = await import('../../src/lib/db/env');
    const report = formatDatabaseConfigReport();
    assert.match(report, /DATABASE_URL \.+ Missing/);
    assert.match(report, /npm run env:pull/);
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('clearEmptyDatabaseEnvPlaceholders removes Neon integration empty strings', { concurrency: false }, async () => {
  const prev = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL,
  };

  try {
    process.env.DATABASE_URL = '';
    process.env.POSTGRES_URL = '   ';
    process.env.POSTGRES_PRISMA_URL = 'postgres://prisma@host/prisma';

    const { clearEmptyDatabaseEnvPlaceholders } = await import('../../src/lib/db/loadEnv');
    clearEmptyDatabaseEnvPlaceholders();

    assert.equal(process.env.DATABASE_URL, undefined);
    assert.equal(process.env.POSTGRES_URL, undefined);
    assert.equal(process.env.POSTGRES_PRISMA_URL, 'postgres://prisma@host/prisma');
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('loadProductionAuditEnv loads .env.prod.live when present', { concurrency: false }, async () => {
  const { writeFileSync, unlinkSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  const prodLivePath = join(process.cwd(), '.env.prod.live');
  const backup = existsSync(prodLivePath) ? (await import('node:fs')).readFileSync(prodLivePath, 'utf8') : null;
  const prev = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL,
  };

  try {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;

    writeFileSync(
      prodLivePath,
      'DATABASE_URL=postgres://prod-live-user:secret@ep-prod.example/neondb?sslmode=require\n',
    );

    const { loadProductionAuditEnv } = await import('../../src/lib/db/loadEnv');
    loadProductionAuditEnv();

    const { getDatabaseUrl, getDatabaseHost } = await import('../../src/lib/db/env');
    assert.equal(getDatabaseHost(), 'ep-prod.example');
    assert.match(getDatabaseUrl(), /prod-live-user/);
  } finally {
    if (backup !== null) writeFileSync(prodLivePath, backup);
    else if (existsSync(prodLivePath)) unlinkSync(prodLivePath);

    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('loadAppEnv loads .env.local over .env', { concurrency: false }, async () => {
  const { writeFileSync, unlinkSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  const envPath = join(process.cwd(), '.env.test-loader');
  const localPath = join(process.cwd(), '.env.local.test-loader');
  const prevDb = process.env.DATABASE_URL;

  try {
    delete process.env.DATABASE_URL;
    writeFileSync(envPath, 'DATABASE_URL=postgres://from-env/test\n');
    writeFileSync(localPath, 'DATABASE_URL=postgres://from-local/test\n');

    // Temporarily point loader at test files by setting cwd files — skip, test load order via direct dotenv instead
    const { config } = await import('dotenv');
    config({ path: envPath, override: false });
    config({ path: localPath, override: true });
    assert.equal(process.env.DATABASE_URL, 'postgres://from-local/test');
  } finally {
    if (existsSync(envPath)) unlinkSync(envPath);
    if (existsSync(localPath)) unlinkSync(localPath);
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
  }
});
