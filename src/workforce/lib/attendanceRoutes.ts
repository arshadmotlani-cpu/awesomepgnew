export const ATTENDANCE_SELF_HREF = '/attendance';
export const ATTENDANCE_MANAGE_HREF = '/attendance/manage';
export const ATTENDANCE_MAP_HREF = '/attendance/map';
export const ATTENDANCE_OFFICE_SETTINGS_HREF = '/settings/attendance';

export function isOwnerAttendancePath(pathname: string): boolean {
  return (
    pathname === ATTENDANCE_MANAGE_HREF ||
    pathname.startsWith(`${ATTENDANCE_MANAGE_HREF}/`) ||
    pathname === ATTENDANCE_MAP_HREF ||
    pathname.startsWith(`${ATTENDANCE_MAP_HREF}/`)
  );
}
