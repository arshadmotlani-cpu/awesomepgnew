/** Shared admin resident search types — used by API, services, and all UI selectors. */

export type AdminResidentTenancyStatus =
  | 'unassigned'
  | 'active'
  | 'vacating'
  | 'vacated'
  | 'blocked';

export type AdminResidentSearchResult = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  gender: 'male' | 'female' | 'other';
  tenancyStatus: AdminResidentTenancyStatus;
  pgId: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  roomId: string | null;
  bedId: string | null;
  monthlyRentPaise: number;
  bookingId: string | null;
  bookingCode: string | null;
  createdAt: string;
};

export type AdminResidentSearchErrorCode =
  | 'permission_denied'
  | 'database_error'
  | 'network_error'
  | 'invalid_query';

export type AdminResidentSearchApiSuccess = {
  ok: true;
  data: AdminResidentSearchResult[];
  count: number;
};

export type AdminResidentSearchApiFailure = {
  ok: false;
  error: string;
  code: AdminResidentSearchErrorCode;
};

export type AdminResidentSearchApiResponse =
  | AdminResidentSearchApiSuccess
  | AdminResidentSearchApiFailure;

export const ADMIN_RESIDENT_SEARCH_ERROR_MESSAGES: Record<
  AdminResidentSearchErrorCode,
  string
> = {
  permission_denied: 'Permission denied — your admin role cannot search residents.',
  database_error: 'Database error — search could not complete. Check server logs.',
  network_error: 'Network error — could not reach the server. Try again.',
  invalid_query: 'Enter at least 2 characters to search.',
};

/** @deprecated Use AdminResidentSearchResult — kept for Quick Actions compatibility. */
export type ResidentQuickResult = AdminResidentSearchResult;
