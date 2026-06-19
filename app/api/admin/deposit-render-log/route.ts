import { NextResponse } from 'next/server';
import { jsonSafe } from '@/src/lib/depositPageDebug';

const INVESTIGATION_TAGS = new Set([
  '[DEPOSIT_SAVE_START]',
  '[DEPOSIT_SAVE_AFTER_UPDATE]',
  '[DEPOSIT_SAVE_AFTER_SYNC]',
  '[DEPOSIT_SAVE_AFTER_REVALIDATE]',
  '[DEPOSIT_PAGE_LOAD_START]',
  '[DEPOSIT_PAGE_LOAD_SUCCESS]',
  '[DEPOSIT_PAGE_LOAD_FAILED]',
  '[DEPOSIT_COMPONENT_RENDER]',
  '[DEPOSIT_COMPONENT_FAILED]',
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tag = typeof body.tag === 'string' ? body.tag : null;
    const phase = body.phase ?? 'failed';
    const section = body.section ?? body.component ?? 'unknown';
    const bookingId = body.bookingId ?? 'unknown';

    if (tag && INVESTIGATION_TAGS.has(tag)) {
      console.error(tag, jsonSafe(body));
      return NextResponse.json({ ok: true });
    }

    if (phase === 'start') {
      console.error('[DEPOSIT_RENDER_START]', jsonSafe({ section, bookingId, data: body.data, surface: body.surface }));
    } else if (phase === 'ok') {
      console.error('[DEPOSIT_RENDER_OK]', jsonSafe({ section, bookingId, surface: body.surface }));
    } else if (tag === '[DEPOSIT_COMPONENT_RENDER]') {
      console.error('[DEPOSIT_COMPONENT_RENDER]', jsonSafe(body));
    } else if (tag === '[DEPOSIT_COMPONENT_FAILED]') {
      console.error('[DEPOSIT_COMPONENT_FAILED]', jsonSafe(body));
    } else {
      console.error(
        '[DEPOSIT_RENDER_FAILED]',
        jsonSafe({
          section,
          bookingId,
          file: body.file ?? null,
          line: body.line ?? null,
          error: body.error ?? null,
          stack: body.stack ?? null,
          componentStack: body.componentStack ?? null,
          data: body.data ?? null,
          surface: body.surface ?? 'client',
        }),
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DEPOSIT_COMPONENT_FAILED] log route error', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
