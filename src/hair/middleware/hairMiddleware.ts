import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { HAIR_SESSION_COOKIE } from '@/src/hair/lib/auth/constants';
import {
  hairPublicToInternal,
  isHairHostFromHeaders,
  isHairProtectedPath,
  isHairPublicPath,
  resolveHairTenantSlugFromHeaders,
} from '@/src/hair/lib/host';

export function hairMiddleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (!isHairHostFromHeaders(request.headers)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-hair-app', '1');
  requestHeaders.set('x-hair-pathname', pathname);
  const tenantSlug = resolveHairTenantSlugFromHeaders(request.headers);
  if (tenantSlug) {
    requestHeaders.set('x-hair-tenant-slug', tenantSlug);
  }

  // Platform SaaS shares the fyhair host. Never 404 /platform/* here —
  // platformMiddleware should already have handled these, but keep a safe pass-through.
  if (pathname.startsWith('/platform')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!isHairPublicPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  const hasSession = Boolean(request.cookies.get(HAIR_SESSION_COOKIE)?.value);

  // Phase F: tenant subdomain cannot switch orgs via picker
  if (
    tenantSlug &&
    (pathname === '/select-organization' ||
      pathname.startsWith('/select-organization/') ||
      pathname === '/fyh/select-organization' ||
      pathname.startsWith('/fyh/select-organization/'))
  ) {
    return NextResponse.redirect(new URL('/dashboard/revenue', request.url));
  }

  if (pathname === '/login' || pathname === '/auth/login') {
    // Cookie presence is not a validated session. Redirecting /login → /landing
    // while /landing NEXT_REDIRECTs to /login causes a browser reload loop.
    const rewrite = new URL('/fyh/auth/login', request.url);
    rewrite.search = request.nextUrl.search;
    return NextResponse.rewrite(rewrite, { request: { headers: requestHeaders } });
  }

  if (pathname === '/') {
    const dest = hasSession ? '/landing' : '/login';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (pathname === '/fyh/auth/login') {
    const rewrite = new URL('/fyh/auth/login', request.url);
    rewrite.search = request.nextUrl.search;
    return NextResponse.rewrite(rewrite, { request: { headers: requestHeaders } });
  }

  if (isHairProtectedPath(pathname) && !hasSession) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  // Rewrite public URLs → /fyh/... so they never collide with Capital/PG pages.
  const internal = hairPublicToInternal(pathname);
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

export function shouldRunHairMiddleware(request: NextRequest): boolean {
  return isHairHostFromHeaders(request.headers);
}
