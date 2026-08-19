import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  SIGNUP_SESSION_COOKIE,
} from '@/src/lib/auth/constants';
import { PLATFORM_SESSION_COOKIE } from '@/src/platform/lib/auth/constants';
import {
  capitalMiddleware,
  shouldRunCapitalMiddleware,
} from '@/src/capital/middleware/capitalMiddleware';
import {
  hairMiddleware,
  shouldRunHairMiddleware,
} from '@/src/hair/middleware/hairMiddleware';
import {
  previewFyhMiddleware,
  shouldRunPreviewFyhMiddleware,
} from '@/src/hair/middleware/previewFyhMiddleware';
import {
  ownerMiddleware,
  shouldRunOwnerMiddleware,
} from '@/src/owner/middleware/ownerMiddleware';

function needsCustomerAuth(pathname: string): boolean {
  if (pathname === '/booking/new') return true;
  if (pathname.startsWith('/booking/')) return true;
  if (pathname.startsWith('/account/')) return true;
  return false;
}

function needsAdminAuth(pathname: string): boolean {
  if (!pathname.startsWith('/admin')) return false;
  if (pathname === '/admin/login') return false;
  if (pathname === '/admin/forgot-password') return false;
  if (pathname === '/admin/reset-password') return false;
  return true;
}

function residentInvoiceRef(pathname: string): string | null {
  const prefix = '/resident/invoices/';
  if (!pathname.startsWith(prefix)) return null;
  const ref = pathname.slice(prefix.length).split('/')[0]?.trim();
  return ref || null;
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

function pgApexToWwwRedirect(request: NextRequest): NextResponse | null {
  const hostHeader =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    '';
  const hostname = hostHeader.split(':')[0]?.toLowerCase() ?? '';
  if (hostname !== 'awesomepg.in') return null;
  const url = request.nextUrl.clone();
  url.hostname = 'www.awesomepg.in';
  if (process.env.NODE_ENV === 'production') {
    url.protocol = 'https:';
  }
  return NextResponse.redirect(url, 308);
}

function needsPlatformAuth(pathname: string): boolean {
  if (!pathname.startsWith('/platform')) return false;
  if (pathname === '/platform/auth/login' || pathname.startsWith('/platform/auth/login')) {
    return false;
  }
  return true;
}

function platformMiddleware(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/platform')) return null;

  const requestHeaders = attachMonitoringHeaders(request);

  if (pathname === '/platform' || pathname === '/platform/') {
    return NextResponse.redirect(new URL('/platform/dashboard', request.url));
  }

  const hasPlatformSession = Boolean(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);

  if (pathname === '/platform/auth/login' || pathname.startsWith('/platform/auth/login')) {
    if (hasPlatformSession) {
      return NextResponse.redirect(new URL('/platform/dashboard', request.url));
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (needsPlatformAuth(pathname) && !hasPlatformSession) {
    const login = new URL('/platform/auth/login', request.url);
    login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldRunPreviewFyhMiddleware(pathname)) {
    const requestHeaders = attachMonitoringHeaders(request);
    return previewFyhMiddleware(request, requestHeaders);
  }

  const platformResponse = platformMiddleware(request);
  if (platformResponse) return platformResponse;

  if (shouldRunHairMiddleware(request)) {
    return hairMiddleware(request);
  }

  if (shouldRunCapitalMiddleware(request)) {
    return capitalMiddleware(request);
  }

  if (shouldRunOwnerMiddleware(request)) {
    return ownerMiddleware(request);
  }

  const apexRedirect = pgApexToWwwRedirect(request);
  if (apexRedirect) return apexRedirect;

  const capitalOnlyPaths = [
    '/dashboard',
    '/assets',
    '/expenses',
    '/payments',
    '/capital',
    '/ledger',
    '/documents',
    '/reports',
    '/analytics',
    '/settings',
    '/activity',
    '/search',
    '/auth',
    '/api/capital',
  ];
  if (capitalOnlyPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return new NextResponse(null, { status: 404 });
  }

  const ownerOnlyPaths = [
    '/owner',
    '/net-worth',
    '/cashflow',
    '/assets',
    '/liabilities',
    '/investments',
    '/wealth',
    '/api/owner',
  ];
  if (ownerOnlyPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return new NextResponse(null, { status: 404 });
  }

  const hairOnlyPaths = [
    '/fyh',
    '/customers',
    '/appointments',
    '/billing',
    '/services',
    '/products',
    '/inventory',
    '/staff',
    '/profile',
    '/api/hair',
  ];
  if (hairOnlyPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return new NextResponse(null, { status: 404 });
  }

  const requestHeaders = attachMonitoringHeaders(request);

  // Clear stale signup cookies on plain Login (RSC cannot mutate cookies).
  if (pathname === '/login' && request.nextUrl.searchParams.get('signup') !== '1') {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set('x-request-id', requestHeaders.get('x-request-id')!);
    response.cookies.set(SIGNUP_SESSION_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    response.cookies.set('apg_signup_verified', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return response;
  }

  if (needsCustomerAuth(pathname)) {
    const customerToken = request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
    const adminToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const signupSession = request.cookies.get(SIGNUP_SESSION_COOKIE)?.value;
    const allowSignupPassword =
      pathname === '/account/set-password' && Boolean(signupSession);

    if (!customerToken && !allowSignupPassword) {
      const invoiceRef = residentInvoiceRef(pathname);

      if (invoiceRef && adminToken) {
        console.warn(
          '[middleware] resident_invoice_admin_session_redirect',
          JSON.stringify({
            pathname,
            reason: 'admin_session_not_customer_session',
            invoiceRef,
            redirectTo: `/admin/invoices/${invoiceRef}`,
          }),
        );
        const adminInvoice = new URL(`/admin/invoices/${invoiceRef}`, request.url);
        return NextResponse.redirect(adminInvoice);
      }

      console.warn(
        '[middleware] customer_auth_redirect',
        JSON.stringify({
          pathname,
          reason: adminToken ? 'missing_customer_session' : 'no_session',
          hasAdminSession: Boolean(adminToken),
          hasCustomerSession: false,
          hasSignupSession: Boolean(signupSession),
        }),
      );

      const login = new URL('/login', request.url);
      login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }

    requestHeaders.set('x-user-id', 'customer');
    if (customerToken) {
      requestHeaders.set('x-session-kind', 'customer');
    }
  }

  if (needsAdminAuth(pathname)) {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!token) {
      const login = new URL('/admin/login', request.url);
      login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
    requestHeaders.set('x-user-id', 'admin');
    requestHeaders.set('x-session-kind', 'admin');
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-request-id', requestHeaders.get('x-request-id')!);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
