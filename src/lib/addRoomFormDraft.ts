import type { RoomSharingCount } from './roomSharing';

export type AddRoomFormDraft = {
  floorNumber: string;
  floorLabel: string;
  roomNumber: string;
  roomTypeName: string;
  sharingCount: RoomSharingCount;
  bedsToAdd: RoomSharingCount;
  hasAc: boolean;
  dailyRate: string;
  weeklyRate: string;
  monthlyRate: string;
  dailyDeposit: string;
  weeklyDeposit: string;
  monthlyDeposit: string;
};

export const EMPTY_ADD_ROOM_FORM: AddRoomFormDraft = {
  floorNumber: '0',
  floorLabel: '',
  roomNumber: '',
  roomTypeName: '',
  sharingCount: 2,
  bedsToAdd: 2,
  hasAc: false,
  dailyRate: '',
  weeklyRate: '',
  monthlyRate: '',
  dailyDeposit: '',
  weeklyDeposit: '',
  monthlyDeposit: '',
};

function storageKey(pgId: string) {
  return `awesomepg:add-room-draft:${pgId}`;
}

export function loadAddRoomFormDraft(pgId: string): AddRoomFormDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(pgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AddRoomFormDraft>;
    return { ...EMPTY_ADD_ROOM_FORM, ...parsed };
  } catch {
    return null;
  }
}

export function saveAddRoomFormDraft(pgId: string, draft: AddRoomFormDraft) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(pgId), JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

export function clearAddRoomFormDraft(pgId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(storageKey(pgId));
}

/** e.g. 202 → 203, 101 → 102 — only bumps trailing digits. */
export function suggestNextRoomNumber(roomNumber: string): string {
  const trimmed = roomNumber.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return trimmed;
  const prefix = match[1];
  const digits = match[2];
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${prefix}${next}`;
}

export function buildAddRoomFormData(draft: AddRoomFormDraft): FormData {
  const fd = new FormData();
  fd.set('floorNumber', draft.floorNumber);
  fd.set('floorLabel', draft.floorLabel);
  fd.set('roomNumber', draft.roomNumber);
  fd.set('roomTypeName', draft.roomTypeName);
  fd.set('sharingCount', String(draft.sharingCount));
  fd.set('bedsToAdd', String(draft.bedsToAdd));
  if (draft.hasAc) fd.set('hasAc', 'on');
  fd.set('dailyRate', draft.dailyRate);
  fd.set('weeklyRate', draft.weeklyRate);
  fd.set('monthlyRate', draft.monthlyRate);
  fd.set('dailyDeposit', draft.dailyDeposit);
  fd.set('weeklyDeposit', draft.weeklyDeposit);
  fd.set('monthlyDeposit', draft.monthlyDeposit);
  return fd;
}
