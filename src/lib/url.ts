/**
 * Single source of truth for absolute app URLs (invoices, WhatsApp, notifications, links).
 *
 * Production  → https://www.awesomepg.in
 * Preview     → https://{VERCEL_URL}
 * Development → http://localhost:3000
 */

export const CANONICAL_PRODUCTION_URL = 'https://www.awesomepg.in';
export const DEVELOPMENT_APP_URL = 'http://localhost:3000';

export type AppDeployment = 'production' | 'preview' | 'development';

export function getAppDeployment(): AppDeployment {
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  return 'development';
}

function normalizeOrigin(url: string): string {
  return url.replace(/\/$/, '');
}

function vercelPreviewOrigin(): string | null {
  const raw =
    process.env.VERCEL_URL?.trim() || process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return host ? `https://${host}` : null;
}

/** Server-safe canonical app origin. */
export function getAppUrl(): string {
  const deployment = getAppDeployment();
  if (deployment === 'production') {
    return CANONICAL_PRODUCTION_URL;
  }
  if (deployment === 'preview') {
    return vercelPreviewOrigin() ?? CANONICAL_PRODUCTION_URL;
  }
  return DEVELOPMENT_APP_URL;
}

/** Absolute URL for a path on the app origin. */
export function appAbsoluteUrl(path: string): string {
  const base = normalizeOrigin(getAppUrl());
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function isAwesomePgProductionHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'www.awesomepg.in' || host === 'awesomepg.in';
}

/**
 * Client components: origin for shareable links (WhatsApp, referrals).
 * Never returns localhost when the admin is on awesomepg.in.
 */
export function clientAppBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (isAwesomePgProductionHost(host)) {
      return CANONICAL_PRODUCTION_URL;
    }
    if (host.endsWith('.vercel.app')) {
      return normalizeOrigin(window.location.origin);
    }
  }
  return getAppUrl();
}

/** Absolute URL for a path — safe in `'use client'` components. */
export function clientAppAbsoluteUrl(path: string): string {
  const base = normalizeOrigin(clientAppBaseUrl());
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
