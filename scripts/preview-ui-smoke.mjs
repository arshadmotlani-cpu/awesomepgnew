#!/usr/bin/env node
/**
 * Preview deployment UI smoke — uses vercel curl to bypass Deployment Protection.
 */
import { execFileSync } from 'node:child_process';

const DEPLOY =
  process.env.PREVIEW_URL ??
  'https://awesomepg-k59k-keo05die9-arshadmotlani-3160s-projects.vercel.app';

const CHECKS = [
  { path: '/platform/auth/login', expect: /Login · Awesome PG|Sign in/i },
  { path: '/fyh/auth/login', expect: /For Your Hair|Sign in/i },
  { path: '/platform/admin', expect: /login|Login|Sign in|admin/i, allowRedirect: true },
  { path: '/fyh/team', expect: /login|Sign in|For Your Hair/i, allowRedirect: true },
  { path: '/platform/admin/organizations', expect: /login|Login|organizations/i, allowRedirect: true },
  { path: '/platform/admin/plans', expect: /login|Login|plans/i, allowRedirect: true },
  { path: '/platform/admin/subscriptions', expect: /login|Login|subscription/i, allowRedirect: true },
];

function vercelCurl(path) {
  const out = execFileSync(
    'vercel',
    ['curl', path, '--deployment', DEPLOY, '--yes', '-s', '-w', '\n__STATUS__%{http_code}'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const idx = out.lastIndexOf('__STATUS__');
  const body = out.slice(0, idx);
  const status = Number(out.slice(idx + 10).trim());
  return { status, body };
}

let failed = 0;
console.log('Preview UI smoke:', DEPLOY);
for (const { path, expect, allowRedirect } of CHECKS) {
  const { status, body } = vercelCurl(path);
  const is404 =
    (body.includes('<h1') && body.includes('Page not found')) ||
    body.includes('This path is not part of');
  const matches = expect.test(body);
  const ok =
    !is404 &&
    (status === 200 || (allowRedirect && status >= 300 && status < 400)) &&
    (status === 200 ? matches : true);
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${status} ${path}`);
  if (!ok) {
    failed += 1;
    console.log('  snippet:', body.replace(/\s+/g, ' ').slice(0, 120));
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\n✓ Preview UI smoke passed');
