import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { OWNER_SESSION_COOKIE } from '@/src/owner/lib/auth/constants';
import {
  isOwnerHostFromHeaders,
  isOwnerProtectedPath,
  isOwnerPublicPath,
  ownerPublicToInternal,
} from '@/src/owner/lib/host';

export function ownerMiddleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (!isOwnerHostFromHeaders(request.headers)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-owner-app', '1');
  requestHeaders.set('x-owner-pathname', pathname);

  if (!isOwnerPublicPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  const hasSession = Boolean(request.cookies.get(OWNER_SESSION_COOKIE)?.value);

  if (pathname === '/login' || pathname === '/auth/login') {
    if (hasSession) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    const rewrite = new URL('/owner/auth/login', request.url);
    rewrite.search = request.nextUrl.search;
    return NextResponse.rewrite(rewrite, { request: { headers: requestHeaders } });
  }

  if (pathname === '/') {
    const dest = hasSession ? '/dashboard' : '/login';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (pathname === '/owner/auth/login' && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (isOwnerProtectedPath(pathname) && !hasSession) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  const internal = ownerPublicToInternal(pathname);
  if (internal && internal !== pathname) {
    const rewrite = new URL(internal, request.url);
    rewrite.search = request.nextUrl.search;
    const response = NextResponse.rewrite(rewrite, { request: { headers: requestHeaders } });
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    return response;
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

export function shouldRunOwnerMiddleware(request: NextRequest): boolean {
  return isOwnerHostFromHeaders(request.headers);
}
