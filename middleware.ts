import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
} from '@/src/lib/auth/constants';

function needsCustomerAuth(pathname: string): boolean {
  if (pathname === '/booking/new') return true;
  if (pathname.startsWith('/booking/')) return true;
  if (pathname.startsWith('/account/')) return true;
  return false;
}

function needsAdminAuth(pathname: string): boolean {
  if (!pathname.startsWith('/admin')) return false;
  if (pathname === '/admin/login') return false;
  return true;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (needsCustomerAuth(pathname)) {
    const token = request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
    if (!token) {
      const login = new URL('/login', request.url);
      login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
  }

  if (needsAdminAuth(pathname)) {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!token) {
      const login = new URL('/admin/login', request.url);
      login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/booking/:path*',
    '/account/:path*',
    '/admin/:path*',
  ],
};
