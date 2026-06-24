const BOT_UA =
  /bot|crawler|spider|headless|preview|slurp|wget|curl|python-requests|go-http-client|axios|scrapy|facebookexternalhit|whatsapp|telegram|discordbot|linkedinbot|twitterbot|pinterest|lighthouse|pagespeed|uptime|pingdom|statuscake|betteruptake|semrush|ahrefs|petalbot|bytespider|gptbot|claudebot|anthropic|vercel-screenshot|vercel-favicon|vercelbot/i;

const PROBE_UA = /vercel-(?:monitor|probe|edge)/i;

const VERIFY_UA = /^AwesomePG-Analytics-Verify\//i;

/** Skip automated traffic — real browsers only. */
export function shouldSkipAnalyticsUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent?.trim()) return false;
  const ua = userAgent.trim();
  if (VERIFY_UA.test(ua)) return false;
  if (BOT_UA.test(ua)) return true;
  if (PROBE_UA.test(ua)) return true;
  return false;
}

/** Health checks and deployment probes — never counted as visits. */
export function shouldSkipAnalyticsPath(pathname: string): boolean {
  if (!pathname) return true;
  if (pathname === '/api/health') return true;
  if (pathname.startsWith('/api/webhooks/')) return true;
  if (pathname.startsWith('/api/cron/')) return true;
  return false;
}
