import type { DevAssistantDebugContext } from '@/src/lib/devAssistant/types';

export function formatDebugContextForPrompt(ctx: DevAssistantDebugContext): string {
  const lines: string[] = [
    '=== AUTO-COLLECTED DEBUG CONTEXT ===',
    `URL: ${ctx.url}`,
    `Page: ${ctx.pageName} (${ctx.pathname})`,
    `Title: ${ctx.pageTitle}`,
    `Admin: ${ctx.admin.fullName} <${ctx.admin.email}> (${ctx.admin.role})`,
    `Timestamp: ${ctx.timestamp}`,
    `Viewport: ${ctx.viewport.width}x${ctx.viewport.height} (${ctx.viewport.deviceType})`,
    `Browser: ${ctx.browser.platform} · ${ctx.browser.language}`,
  ];

  const e = ctx.entity;
  if (e.pgId || e.pgName) lines.push(`PG: ${e.pgName ?? e.pgId}`);
  if (e.residentId || e.residentName) lines.push(`Resident: ${e.residentName ?? e.residentId}`);
  if (e.bedCode || e.bedId) lines.push(`Bed: ${e.bedCode ?? e.bedId}`);
  if (e.roomNumber || e.roomId) lines.push(`Room: ${e.roomNumber ?? e.roomId}`);
  if (e.bookingId) lines.push(`Booking: ${e.bookingId}`);

  if (ctx.searchQuery) lines.push(`Search: ${ctx.searchQuery}`);
  if (Object.keys(ctx.filters).length > 0) {
    lines.push(`Filters: ${JSON.stringify(ctx.filters)}`);
  }

  if (ctx.recentErrors.length > 0) {
    lines.push('\n--- Recent errors ---');
    for (const err of ctx.recentErrors.slice(-8)) {
      lines.push(`[${err.type}] ${err.message}${err.stack ? `\n  ${err.stack.split('\n')[0]}` : ''}`);
    }
  }

  if (ctx.recentFailedRequests.length > 0) {
    lines.push('\n--- Failed requests ---');
    for (const req of ctx.recentFailedRequests.slice(-6)) {
      lines.push(`${req.method} ${req.url} → ${req.status} ${req.statusText ?? ''}`);
    }
  }

  if (ctx.sentry?.lastEventId) {
    lines.push(`\nSentry last event: ${ctx.sentry.lastEventId}`);
  }

  if (ctx.pageHints && Object.keys(ctx.pageHints).length > 0) {
    lines.push(`\nPage hints: ${JSON.stringify(ctx.pageHints)}`);
  }

  lines.push('=== END CONTEXT ===');
  return lines.join('\n');
}

export function formatDebugContextForClipboard(ctx: DevAssistantDebugContext): string {
  return formatDebugContextForPrompt(ctx);
}
