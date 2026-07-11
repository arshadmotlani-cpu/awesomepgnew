import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { CAPITAL_SESSION_COOKIE } from '@/src/capital/lib/auth/constants';
import {
  isCapitalAllowedPath,
  isCapitalHostFromHeaders,
  isCapitalProtectedPath,
} from '@/src/capital/lib/host';

export function capitalMiddleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (!isCapitalHostFromHeaders(request.headers)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-capital-app', '1');

  // Invest host: only Capital routes — never fall through to Awesome PG pages.
  if (!isCapitalAllowedPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  const hasSession = Boolean(request.cookies.get(CAPITAL_SESSION_COOKIE)?.value);

  // Public login URL is /login — rewrite to internal /auth/login
  if (pathname === '/login') {
    if (hasSession) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    const rewrite = new URL('/auth/login', request.url);
    rewrite.search = request.nextUrl.search;
    return NextResponse.rewrite(rewrite, { request: { headers: requestHeaders } });
  }

  if (pathname === '/') {
    const dest = hasSession ? '/dashboard' : '/login';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (pathname === '/auth/login' && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (isCapitalProtectedPath(pathname) && !hasSession) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export function shouldRunCapitalMiddleware(request: NextRequest): boolean {
  return isCapitalHostFromHeaders(request.headers);
}
