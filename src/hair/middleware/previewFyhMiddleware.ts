import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Allow /fyh/* on the main Preview host (*.vercel.app) before fyhair DNS cutover. */
export function shouldRunPreviewFyhMiddleware(pathname: string): boolean {
  return process.env.VERCEL_ENV === 'preview' && pathname.startsWith('/fyh');
}

export function previewFyhMiddleware(
  request: NextRequest,
  requestHeaders: Headers,
): NextResponse {
  requestHeaders.set('x-hair-app', '1');
  requestHeaders.set('x-hair-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
