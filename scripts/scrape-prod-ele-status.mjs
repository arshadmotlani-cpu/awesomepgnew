/* eslint-disable no-console */
import { execFileSync } from 'node:child_process';

const BASE = 'https://www.awesomepg.in';
const INVOICE = 'ELE-2026-06-0035';
const FIN = '48541ed6-6410-47f9-857e-4e0b515deb45';

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

const ops = await (await fetch(`${BASE}/admin/operations?filter=payment_proof`, { headers })).text();
console.log('ops has', INVOICE, ':', ops.includes(INVOICE));
console.log('ops has Angatra:', /angatra/i.test(ops));

const inv = await (await fetch(`${BASE}/admin/invoices/${FIN}`, { headers })).text();
const statuses = ['paid', 'pending', 'payment_in_progress', 'overdue', 'cancelled'];
for (const s of statuses) {
  if (new RegExp(`\\b${s}\\b`, 'i').test(inv)) console.log('invoice page mentions:', s);
}
const amt = inv.match(/₹\s*827|827/);
console.log('amount 827 on invoice page:', Boolean(amt));
const title = inv.match(/ELE-2026-06-0035/);
console.log('invoice number on page:', Boolean(title));

// extract visible status near Paid/Pending badges
const text = inv.replace(/<[^>]+>/g, '\n');
const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
const interesting = lines.filter((l) =>
  /paid|pending|electric|angatra|827|ele-2026/i.test(l),
);
console.log('\ninvoice page lines:', interesting.slice(0, 25));
