import { execFileSync } from 'node:child_process';

const BASE = 'https://www.awesomepg.in';
const cookie = execFileSync(
  'python3',
  [
    '-c',
    `import browser_cookie3
from pathlib import Path
cf=Path.home()/"Library/Application Support/Google/Chrome/Profile 6/Cookies"
print(";".join(c.name+"="+c.value for c in browser_cookie3.chrome(cookie_file=str(cf),domain_name="awesomepg.in") if c.name=="apg_admin_session"))`,
  ],
  { encoding: 'utf8' },
).trim();

async function check(id, name) {
  const res = await fetch(`${BASE}/admin/residents/${id}`, { headers: { Cookie: cookie } });
  const html = await res.text();
  const fail = res.status >= 500 || html.includes('__next_error__');
  console.log(name, res.status, fail ? 'FAIL' : 'OK');
}

await check('503c6848-5850-4b26-b32d-2888c50ba986', 'arshad');
await check('3cd0d0cb-5f4c-4fd9-ae8b-780664e61f1c', 'dhruv');
