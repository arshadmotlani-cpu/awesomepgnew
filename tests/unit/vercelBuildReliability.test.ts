import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = join(process.cwd());

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Vercel build reliability', () => {
  it('vercel-build runs deploy tsc before next build and skips duplicate Next typecheck', () => {
    const sh = read('scripts/vercel-build.sh');
    assert.match(sh, /tsc -p tsconfig\.deploy\.json/);
    assert.match(sh, /SKIP_NEXT_BUILDTIME_TYPECHECK=1/);
    assert.match(sh, /vercel_build_phase/);
    const tscIdx = sh.indexOf('tsc -p tsconfig.deploy.json');
    const skipIdx = sh.indexOf('SKIP_NEXT_BUILDTIME_TYPECHECK=1');
    const nextIdx = sh.indexOf('next build');
    assert.ok(tscIdx < skipIdx && skipIdx < nextIdx);
  });

  it('next.config honors SKIP_NEXT_BUILDTIME_TYPECHECK for typescript.ignoreBuildErrors', () => {
    const cfg = read('next.config.ts');
    assert.match(cfg, /SKIP_NEXT_BUILDTIME_TYPECHECK/);
    assert.match(cfg, /ignoreBuildErrors: skipNextBuildtimeTypecheck/);
    assert.match(cfg, /tsconfigPath: 'tsconfig\.deploy\.json'/);
  });

  it('postgres connect_timeout is bounded for migration clients', () => {
    const opts = read('src/lib/db/connectionOptions.ts');
    assert.match(opts, /connect_timeout: 15/);
  });
});
