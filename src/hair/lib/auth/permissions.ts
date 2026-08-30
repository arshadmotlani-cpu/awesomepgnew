import { redirect } from 'next/navigation';
import { hairAppRedirect } from '@/src/hair/lib/host';
import { HairAuthError, requireHairAuth, requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import {
  hasPermission as checkPermission,
  pagePermissionForPath,
  type HairPagePermission,
  type HairPermission,
} from '@/src/hair/lib/auth/permissionTypes';
import type { HairAdmin } from '@/src/hair/lib/auth/session';

export {
  HAIR_ACTION_PERMISSIONS,
  HAIR_PAGE_PERMISSIONS,
  HAIR_PERMISSIONS,
  PERMISSIONS_CATALOG,
  ROLE_PRESETS,
  hasPermission,
  pagePermissionForPath,
  resolvePermissions,
  type HairActionPermission,
  type HairPagePermission,
  type HairPermission,
} from '@/src/hair/lib/auth/permissionTypes';

export class HairPermissionError extends Error {
  constructor(message = 'Permission denied') {
    super(message);
    this.name = 'HairPermissionError';
  }
}

export async function requirePermission(key: HairPermission): Promise<HairAdmin> {
  const admin = await requireHairAuth();
  if (!checkPermission(admin, key)) {
    throw new HairPermissionError(`Missing permission: ${key}`);
  }
  return admin;
}

export async function requirePermissionPage(key: HairPermission): Promise<HairAdmin> {
  const admin = await requireHairAuthPage();
  if (!checkPermission(admin, key)) {
    redirect(await hairAppRedirect('/access-denied'));
  }
  return admin;
}

export async function requirePagePermissionForPath(pathname: string): Promise<HairAdmin> {
  const admin = await requireHairAuthPage();
  const key = pagePermissionForPath(pathname);
  if (key && !checkPermission(admin, key)) {
    redirect(await hairAppRedirect('/access-denied'));
  }
  return admin;
}

export function isPermissionError(error: unknown): error is HairAuthError | HairPermissionError {
  return (
    error instanceof Error &&
    (error.name === 'HairPermissionError' || error.name === 'HairAuthError')
  );
}
