'use client';

import {
  HAIR_PERMISSIONS,
  PERMISSIONS_CATALOG,
  ROLE_PRESETS,
  type HairPermission,
} from '@/src/hair/lib/auth/permissionTypes';
import type { FyhAdminRole } from '@/src/hair/db/schema/admin';

function presetSet(role: FyhAdminRole): Set<HairPermission> {
  return new Set(ROLE_PRESETS[role]);
}

export function PermissionsMatrixPanel() {
  const pageRows = PERMISSIONS_CATALOG.filter((p) => p.group === 'page');
  const actionRows = PERMISSIONS_CATALOG.filter((p) => p.group === 'action');

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Access</p>
        <h2 className="fyh-display mt-1 text-2xl font-semibold">Permissions</h2>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Read-only matrix for Phase I. Custom per-user overrides will be editable in a later phase;
          empty <code className="text-fyh-accent">permissions</code> jsonb uses the role preset below.
        </p>
      </div>

      <div className="fyh-glass overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 text-center font-medium">admin</th>
              <th className="px-4 py-3 text-center font-medium">super_admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--fyh-border)]">
            {[...pageRows, ...actionRows].map((row) => {
              const adminHas = presetSet('admin').has(row.key);
              const superHas = presetSet('super_admin').has(row.key);
              return (
                <tr key={row.key}>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-fyh-text">{row.label}</p>
                    <p className="mt-0.5 font-mono text-xs text-fyh-text-muted">{row.key}</p>
                  </td>
                  <td className="px-4 py-3 text-fyh-text-secondary">{row.description}</td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {adminHas ? (
                      <span className="text-fyh-success">✓</span>
                    ) : (
                      <span className="text-fyh-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {superHas ? (
                      <span className="text-fyh-success">✓</span>
                    ) : (
                      <span className="text-fyh-text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="fyh-glass space-y-2 p-4 text-sm text-fyh-text-secondary">
        <p className="font-medium text-fyh-text">Role presets</p>
        <p>
          <span className="font-medium text-fyh-text">admin</span> — front-desk default (
          {ROLE_PRESETS.admin.length} keys): dashboard, customers, appointments, billing, quick sale,
          checkout.
        </p>
        <p>
          <span className="font-medium text-fyh-text">super_admin</span> — all{' '}
          {HAIR_PERMISSIONS.length} keys including inventory, reports, settings, exports, and
          commission pay.
        </p>
      </div>
    </div>
  );
}
