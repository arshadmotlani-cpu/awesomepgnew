/**
 * Owner OS event emitters — static audit (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { OWNER_OS_EVENT_TYPES } from '@/src/owner/events/consumers';

describe('Owner OS event pipeline', () => {
  test('every inbox event type has an emitter function', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const emitters = readFileSync(join(process.cwd(), 'src/owner/events/emitters.ts'), 'utf8');
    for (const type of OWNER_OS_EVENT_TYPES) {
      assert.match(emitters, new RegExp(type.replace('.', '\\.')));
    }
  });

  test('deposit emitter is wired in booking lifecycle', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/services/bookingLifecycle.ts'), 'utf8');
    assert.match(src, /emitDepositCollectedEvent/);
  });

  test('cron route exists for inbox drain', () => {
    const { readFileSync, existsSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    assert.equal(
      existsSync(join(process.cwd(), 'app/api/cron/owner-os-event-inbox/route.ts')),
      true,
    );
    const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    assert.match(vercel, /owner-os-event-inbox/);
  });
});
