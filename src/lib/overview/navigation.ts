/** @deprecated Import from `@/src/lib/admin/navigation` */
export {
  ADMIN_MODULES,
  ADMIN_MODULES as OVERVIEW_MODULES,
  moduleHref,
  moduleHref as overviewHref,
  modulePgHref,
} from '@/src/lib/admin/navigation';

import { modulePgHref } from '@/src/lib/admin/navigation';

export type OverviewModule = 'revenue' | 'analytics' | 'operations' | 'health';

export function overviewPgEntityHref(pgId: string, from: OverviewModule): string {
  switch (from) {
    case 'operations':
      return modulePgHref('operations', pgId);
    case 'health':
    case 'analytics':
    case 'revenue':
    default:
      return modulePgHref('revenue', pgId);
  }
}
