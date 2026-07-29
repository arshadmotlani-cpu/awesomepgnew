import { AWESOME_PG, AWESOME_PG_BRAND } from '@/src/lib/brand/awesomePgTokens';

const LOGO_URL = `${AWESOME_PG_BRAND.assetBase}/og-mark.svg`;

/** Minimal HTML email wrapper — plain text remains the deliverability fallback. */
export function awesomePgEmailHtml(bodyText: string): string {
  const escaped = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>${AWESOME_PG.name}</title></head>
<body style="margin:0;padding:24px;font-family:system-ui,sans-serif;background:#070A0F;color:#F4F4F5;">
  <div style="max-width:560px;margin:0 auto;">
    <img src="${LOGO_URL}" width="48" height="48" alt="${AWESOME_PG.name}" style="border-radius:12px;margin-bottom:16px;"/>
    <div style="font-size:15px;line-height:1.6;color:#B0B7C3;">${escaped}</div>
    <p style="margin-top:24px;font-size:12px;color:#6B7280;">${AWESOME_PG.name}</p>
  </div>
</body>
</html>`;
}
