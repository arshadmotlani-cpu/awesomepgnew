import adminMarkIntrinsicJson from '@/src/lib/brand/adminMarkIntrinsic.json';

export type AdminMarkIntrinsic = { width: number; height: number };

/** Raster dimensions for SOFT / AUTO / NET WORTH transparent admin wordmarks. */
export const ADMIN_MARK_INTRINSIC = adminMarkIntrinsicJson as {
  soft: AdminMarkIntrinsic;
  auto: AdminMarkIntrinsic;
  netWorth: AdminMarkIntrinsic;
};
