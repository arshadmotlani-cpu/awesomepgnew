import { CustomersList } from '@/src/hair/components/customers/CustomersList';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { customerFieldMask, projectCustomerFields, type CustomerFieldMask } from '@/src/workforce/permissions/fieldProjection';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';
import { requireFyhPermission } from '@/src/workforce/permissions/guards';
import { listClientDirectory, type ClientListRow } from '@/src/hair/services/customerDirectory';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

const OPEN_MASK: CustomerFieldMask = {
  hasFullView: true,
  phone: true,
  whatsapp: true,
  email: true,
  pii: true,
  balance: true,
  packageCredits: true,
};

function maskRow(row: ClientListRow, mask: ReturnType<typeof customerFieldMask>): ClientListRow {
  const projected = projectCustomerFields(row, mask);
  return {
    ...projected,
    membershipLabel: mask.hasFullView ? row.membershipLabel : null,
    packageLabel: mask.packageCredits ? row.packageLabel : null,
    gender: mask.pii ? row.gender : null,
    walletPaise: mask.balance ? row.walletPaise : null,
    outstandingPaise: mask.balance ? row.outstandingPaise : null,
  };
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await getHairSession();
  let mask = OPEN_MASK;
  let canEdit = true;
  let canArchive = true;
  if (session?.workforceEmployeeId || session?.admin.role === 'super_admin') {
    const perm = await requireFyhPermission({ permission: 'customers.customer.view', scope: 'org' });
    mask = customerFieldMask(perm.grants);
    canEdit = permissionSatisfied(perm.grants.permissions, 'customers.customer.edit');
    canArchive = permissionSatisfied(perm.grants.permissions, 'customers.customer.archive');
  }
  const ctx = await getTenantContextForPage();
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? '1', 10);
  const settings = await getSalonSettings(ctx);
  const directory = await listClientDirectory(
    {
      q: params.q,
      page: Number.isFinite(page) ? page : 1,
      timezone: settings.timezone,
    },
    ctx,
  );

  return (
    <CustomersList
      rows={directory.rows.map((row) => maskRow(row, mask))}
      total={directory.total}
      page={directory.page}
      pageSize={directory.pageSize}
      query={params.q?.trim() ?? ''}
      canEdit={canEdit}
      canArchive={canArchive}
    />
  );
}
