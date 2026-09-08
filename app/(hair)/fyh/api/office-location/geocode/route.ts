import { NextResponse } from 'next/server';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { geocodeOfficeLocationQuery } from '@/src/workforce/lib/geocodeOfficeLocation';

async function canManageOfficeLocation(): Promise<boolean> {
  const session = await getHairSession();
  if (!session) return false;
  if (session.admin.role === 'super_admin') return true;
  if (!session.workforceEmployeeId) return false;
  return employeeHasPermission(session.workforceEmployeeId, 'fyh_salon', 'attendance.manage_office');
}

export async function GET(request: Request) {
  try {
    await requireHairHost();
  } catch {
    return NextResponse.json({ error: 'For Your Hair host required.' }, { status: 403 });
  }

  if (!(await canManageOfficeLocation())) {
    return NextResponse.json({ error: 'Not allowed to search office locations.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const result = await geocodeOfficeLocationQuery(q);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, results: [] }, { status: result.error.includes('3 characters') ? 400 : 404 });
  }

  return NextResponse.json({ results: result.results });
}
