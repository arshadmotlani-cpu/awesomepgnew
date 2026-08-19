#!/usr/bin/env node
/**
 * Preview deployment UI smoke — uses vercel curl to bypass Deployment Protection.
 */
import { execFileSync } from 'node:child_process';

const DEPLOY =
  process.env.PREVIEW_URL ??
  'https://awesomepg-k59k-q8cvwdp3w-arshadmotlani-3160s-projects.vercel.app';

const CHECKS = [
  { path: '/platform/auth/login', title: /Login · Awesome PG/i },
  { path: '/fyh/auth/login', title: /For Your Hair/i },
  { path: '/platform/admin', status: [307, 308] },
  { path: '/fyh/team', status: [307, 308] },
  { path: '/fyh/dashboard', status: [307, 308] },
  { path: '/platform/admin/organizations', status: [307, 308] },
  { path: '/platform/admin/plans', status: [307, 308] },
  { path: '/platform/admin/subscriptions', status: [307, 308] },
];

function vercelCurl(path) {
  const out = execFileSync(
    'vercel',
    ['curl', path, '--deployment', DEPLOY, '--yes', '-s', '-w', '\n__STATUS__%{http_code}', '-o', '-'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const idx = out.lastIndexOf('__STATUS__');
  const body = out.slice(0, idx);
  const status = Number(out.slice(idx + 10).trim());
  return { status, body };
}

let failed = 0;
console.log('Preview UI smoke:', DEPLOY);
for (const check of CHECKS) {
  const { status, body } = vercelCurl(check.path);
  const title = body.match(/<title>([^<]+)/)?.[1] ?? '';
  let ok = false;
  if (check.title) {
    ok = status === 200 && check.title.test(title);
  } else if (check.status) {
    ok = check.status.includes(status);
  }
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${status} ${check.path}${title ? ` (${title})` : ''}`);
  if (!ok) {
    failed += 1;
    if (check.title) console.log('  title:', title);
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\n✓ Preview UI smoke passed');
