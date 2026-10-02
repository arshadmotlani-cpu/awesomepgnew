import { pathnameToModule, type AdminModule } from '@/src/lib/admin/navigation';

/** Pathname portion only — safe for module matching (ignores ?query and #hash). */
export function adminNavPathOnly(hrefOrPath: string): string {
  const noHash = hrefOrPath.split('#')[0] ?? hrefOrPath;
  const noQuery = noHash.split('?')[0] ?? noHash;
  return noQuery || '/admin';
}

export function adminNavModuleFor(hrefOrPath: string): AdminModule | null {
  return pathnameToModule(adminNavPathOnly(hrefOrPath));
}

/** True when already on the same route path (ignores query unless href carries query). */
export function adminNavIsExactPath(pathname: string, href: string): boolean {
  return pathname === adminNavPathOnly(href);
}

/**
 * Whether a primary click should no-op (already on this sidebar target).
 * Do not use module equality alone — Billing Center and Collections must stay distinct.
 */
export function adminNavClickIsNoOp(pathname: string, href: string): boolean {
  return adminNavIsExactPath(pathname, href);
}

/** Whether client navigation should run (path change or href query change). */
export function adminNavShouldClientNavigate(pathname: string, href: string): boolean {
  if (adminNavIsExactPath(pathname, href)) {
    return href.includes('?');
  }
  return true;
}
