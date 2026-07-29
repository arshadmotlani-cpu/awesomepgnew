/**
 * Generate static brand SVG assets from shared geometry (no deps).
 * Usage: node scripts/generate-brand-svgs.mjs
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function write(rel, body) {
  const dest = join(ROOT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body, 'utf8');
  console.log('wrote', rel);
}

const APG_SHIELD =
  'M256 48 L416 120 L416 280 Q416 368 256 464 Q96 368 96 280 L96 120 Z';
const APG_A =
  'M256 168 L320 360 H296 L256 272 L216 360 H192 Z M224 300 H288 L256 248 Z';

function apgMark({ fill, stroke, letter }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="APG OS">
  <path d="${APG_SHIELD}" fill="${fill}" stroke="${stroke}" stroke-width="20" stroke-linejoin="round"/>
  <path fill="${letter}" fill-rule="evenodd" d="${APG_A}"/>
</svg>`;
}

function awesomePgMark({ field, roof, body, door }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Awesome PG">
  <rect x="64" y="64" width="384" height="384" rx="96" fill="${field}"/>
  <path d="M256 120 L380 240 H132 Z" fill="${roof}"/>
  <path d="M160 240 H352 V380 H160 Z" fill="${body}"/>
  <path d="M228 380 V300 H284 V380 Z" fill="${door}"/>
</svg>`;
}

function capitalMark({ frame, bar, base }) {
  const bars = [
    [140, 320, 56, 80],
    [228, 260, 56, 140],
    [316, 200, 56, 200],
  ]
    .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${bar}"/>`)
    .join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Capital OS">
  <rect x="96" y="96" width="320" height="320" rx="72" fill="${frame}"/>
  ${bars}
  <line x1="120" y1="400" x2="392" y2="400" stroke="${base}" stroke-width="12" stroke-linecap="round"/>
</svg>`;
}

function fyhMark({ field, letter }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="For Your Hair">
  <rect x="80" y="80" width="352" height="352" rx="88" fill="${field}"/>
  <path fill="${letter}" d="M168 160 H344 V200 H216 V272 H320 V312 H216 V352 H168 Z"/>
  <path fill="${letter}" d="M296 160 H344 V256 Q344 312 296 352 H256 V312 Q288 288 288 256 V160 H296 Z"/>
</svg>`;
}

const SIZES = [
  ['favicon-16.svg', 16],
  ['favicon-20.svg', 20],
  ['favicon-24.svg', 24],
  ['favicon-32.svg', 32],
  ['favicon-48.svg', 48],
  ['icon-64.svg', 64],
  ['icon-128.svg', 128],
  ['icon-192.svg', 192],
  ['icon-512.svg', 512],
];

function copyLadder(baseDir, svgContent) {
  for (const [name] of SIZES) {
    write(`public/${baseDir}/${name}`, svgContent);
  }
  write(`public/${baseDir}/apple-touch-icon.svg`, svgContent);
  write(`public/${baseDir}/og-mark.svg`, svgContent);
}

// Awesome PG
const apgFilled = awesomePgMark({
  field: '#121820',
  roof: '#FF5A1F',
  body: '#FF7A45',
  door: '#070A0F',
});
const apgLight = awesomePgMark({
  field: '#F7F4EF',
  roof: '#FF5A1F',
  body: '#FFB899',
  door: '#FFFFFF',
});
const apgMonoDark = awesomePgMark({
  field: 'none',
  roof: '#FFFFFF',
  body: '#FFFFFF',
  door: '#0B0F14',
});
const apgMonoLight = awesomePgMark({
  field: 'none',
  roof: '#141414',
  body: '#141414',
  door: '#FFFFFF',
});

copyLadder('awesome-pg', apgFilled);
write('public/awesome-pg/mark-filled.svg', apgFilled);
write('public/awesome-pg/mark-light.svg', apgLight);
write('public/awesome-pg/mark-mono-dark.svg', apgMonoDark);
write('public/awesome-pg/mark-mono-light.svg', apgMonoLight);
write(
  'public/awesome-pg/logo-full-dark.svg',
  `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 128" role="img" aria-label="Awesome PG">
  <g transform="translate(8,8) scale(0.22)">${apgFilled.replace(/<\?xml[^>]*>\s*/, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')}</g>
  <text x="140" y="78" fill="#FFFFFF" font-family="system-ui,sans-serif" font-size="48" font-weight="600">Awesome PG</text>
</svg>`,
);

// Capital OS
const capFilled = capitalMark({
  frame: '#0F172A',
  bar: '#22C55E',
  base: '#16A34A',
});
const capLight = capitalMark({
  frame: '#ECFDF5',
  bar: '#16A34A',
  base: '#15803D',
});

copyLadder('capital-os', capFilled);
write('public/capital-os/mark-filled.svg', capFilled);
write('public/capital-os/mark-light.svg', capLight);
write('public/capital-os/mark-mono-dark.svg', capitalMark({ frame: 'none', bar: '#FFFFFF', base: '#FFFFFF' }));
write('public/capital-os/mark-mono-light.svg', capitalMark({ frame: 'none', bar: '#18181B', base: '#18181B' }));

// FYH
const fyhFilled = fyhMark({ field: '#5B21B6', letter: '#F5F3FF' });
const fyhLight = fyhMark({ field: '#EDE9FE', letter: '#6D28D9' });

copyLadder('fyh', fyhFilled);
write('public/fyh/mark-filled.svg', fyhFilled);
write('public/fyh/mark-light.svg', fyhLight);
write('public/fyh/mark-mono-dark.svg', fyhMark({ field: 'none', letter: '#FFFFFF' }));
write('public/fyh/mark-mono-light.svg', fyhMark({ field: 'none', letter: '#4C1D95' }));

console.log('done');
