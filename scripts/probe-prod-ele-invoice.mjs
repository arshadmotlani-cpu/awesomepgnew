/* eslint-disable no-console */
import { execFileSync } from 'node:child_process';

const BASE = 'https://www.awesomepg.in';
const ELEC_INVOICE_ID = 'c024f94a-c7e0-4cf3-912c-4affeb63d2b1';
const FIN_INVOICE_ID = '48541ed6-6410-47f9-857e-4e0b515deb45';

function cookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import browser_cookie3
cf = __import__('pathlib').Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
print(';'.join(c.name+'='+c.value for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in') if c.name=='apg_admin_session'))
`;
  return execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim();
}

const cookie = cookies();
const headers = { Cookie: cookie };

for (const path of [
  `/api/admin/payment-proof/electricity/${ELEC_INVOICE_ID}`,
  `/admin/invoices/${FIN_INVOICE_ID}`,
]) {
  const res = await fetch(BASE + path, { headers, redirect: 'follow' });
  console.log('\n===', path, '===');
  console.log('HTTP', res.status, res.headers.get('content-type'));
  const text = await res.text();
  console.log(text.slice(0, 500));
}
