import {
  ADMIN_RESIDENT_SEARCH_ERROR_MESSAGES,
  type AdminResidentSearchApiResponse,
  type AdminResidentSearchErrorCode,
  type AdminResidentSearchResult,
} from '@/src/lib/admin/residentSearchTypes';

export type AdminResidentSearchOptions = {
  kycApprovedOnly?: boolean;
  signal?: AbortSignal;
};

export type AdminResidentSearchClientResult =
  | { ok: true; data: AdminResidentSearchResult[]; count: number }
  | {
      ok: false;
      error: string;
      code: AdminResidentSearchErrorCode;
    };

function mapHttpStatusToCode(status: number): AdminResidentSearchErrorCode {
  if (status === 401 || status === 403) return 'permission_denied';
  if (status >= 500) return 'database_error';
  return 'database_error';
}

export function residentSearchErrorMessage(
  code: AdminResidentSearchErrorCode,
  serverMessage?: string,
): string {
  if (code === 'permission_denied' && serverMessage) return serverMessage;
  if (code === 'database_error' && serverMessage) return serverMessage;
  return ADMIN_RESIDENT_SEARCH_ERROR_MESSAGES[code];
}

/** Shared fetch for all admin resident search UIs. */
export async function fetchAdminResidents(
  query: string,
  options: AdminResidentSearchOptions = {},
): Promise<AdminResidentSearchClientResult> {
  const q = query.trim();
  if (q.length < 1) {
    return { ok: true, data: [], count: 0 };
  }

  const params = new URLSearchParams({ q });
  if (options.kycApprovedOnly) params.set('kycApproved', '1');

  try {
    const res = await fetch(`/api/admin/residents/search?${params.toString()}`, {
      cache: 'no-store',
      signal: options.signal,
    });

    let json: AdminResidentSearchApiResponse;
    try {
      json = (await res.json()) as AdminResidentSearchApiResponse;
    } catch {
      return {
        ok: false,
        code: 'network_error',
        error: ADMIN_RESIDENT_SEARCH_ERROR_MESSAGES.network_error,
      };
    }

    if (!res.ok || !json.ok) {
      const code =
        !json.ok && json.code
          ? json.code
          : mapHttpStatusToCode(res.status);
      const error =
        !json.ok && json.error
          ? json.error
          : residentSearchErrorMessage(code);
      return { ok: false, code, error };
    }

    return {
      ok: true,
      data: json.data,
      count: json.count ?? json.data.length,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: true, data: [], count: 0 };
    }
    return {
      ok: false,
      code: 'network_error',
      error: ADMIN_RESIDENT_SEARCH_ERROR_MESSAGES.network_error,
    };
  }
}
