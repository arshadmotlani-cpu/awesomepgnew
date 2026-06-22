import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  SIGNUP_SESSION_COOKIE,
} from '@/src/lib/auth/constants';

function needsCustomerAuth(pathname: string): boolean {
  if (pathname === '/booking/new') return true;
  if (pathname.startsWith('/booking/')) return true;
  if (pathname.startsWith('/account/')) return true;
  if (pathname.startsWith('/resident/invoices/')) return true;
  return false;
}

function needsAdminAuth(pathname: string): boolean {
  if (!pathname.startsWith('/admin')) return false;
  if (pathname === '/admin/login') return false;
  if (pathname === '/admin/forgot-password') return false;
  if (pathname === '/admin/reset-password') return false;
  return true;
}

function attachMonitoringHeaders(request: NextRequest): Headers {
  const requestHeaders = new Headers(request.headers);
  if (!requestHeaders.get('x-request-id')) {
    requestHeaders.set('x-request-id', crypto.randomUUID());
  }
  if (!requestHeaders.get('x-request-start')) {
    requestHeaders.set('x-request-start', String(Date.now()));
  }
  requestHeaders.set('x-request-route', request.nextUrl.pathname);
  requestHeaders.set('x-request-method', request.method);
  return requestHeaders;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = attachMonitoringHeaders(request);

  if (needsCustomerAuth(pathname)) {
    const token = request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
    const signupSession = request.cookies.get(SIGNUP_SESSION_COOKIE)?.value;
    const allowSignupPassword =
      pathname === '/account/set-password' && Boolean(signupSession);
    if (!token && !allowSignupPassword) {
      const login = new URL('/login', request.url);
      login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
    requestHeaders.set('x-user-id', 'customer');
  }

  if (needsAdminAuth(pathname)) {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!token) {
      const login = new URL('/admin/login', request.url);
      login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
    requestHeaders.set('x-user-id', 'admin');
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-request-id', requestHeaders.get('x-request-id')!);
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/pgs/:path*',
    '/booking/:path*',
    '/account/:path*',
    '/admin',
    '/admin/:path*',
  ],
};
