import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { HAIR_SESSION_COOKIE } from '@/src/hair/lib/auth/constants';
import { isHairProtectedPath } from '@/src/hair/lib/host';

/** Allow /fyh/* on the main Preview host (*.vercel.app) before fyhair DNS cutover. */
export function shouldRunPreviewFyhMiddleware(pathname: string): boolean {
  return process.env.VERCEL_ENV === 'preview' && pathname.startsWith('/fyh');
}

export function previewFyhMiddleware(
  request: NextRequest,
  requestHeaders: Headers,
): NextResponse {
  const pathname = request.nextUrl.pathname;
  requestHeaders.set('x-hair-app', '1');
  requestHeaders.set('x-hair-pathname', pathname);

  const publicPath = pathname.startsWith('/fyh') ? pathname.slice(4) || '/' : pathname;
  const isLoginPath =
    publicPath === '/auth/login' || publicPath.startsWith('/auth/login');
  const hasSession = Boolean(request.cookies.get(HAIR_SESSION_COOKIE)?.value);

  if (!hasSession && !isLoginPath && isHairProtectedPath(pathname)) {
    const login = new URL('/fyh/auth/login', request.url);
    login.searchParams.set('next', `${publicPath}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}
