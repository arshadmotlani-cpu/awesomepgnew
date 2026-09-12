'use client';

import {
  WORKFORCE_MODULE_LABELS,
  WORKFORCE_PERMISSION_GROUP_LABELS,
  permissionsByModule,
  type WorkforcePermissionDef,
} from '@/src/workforce/types';

type Props = {
  selected: Set<string>;
  name?: string;
  /** Show only sensitive/owner-only permissions */
  sensitiveOnly?: boolean;
};

function PermissionRow({
  def,
  selected,
  name,
}: {
  def: WorkforcePermissionDef;
  selected: Set<string>;
  name: string;
}) {
  return (
    <label className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-[color:var(--fyh-surface-muted)] text-xs">
      <input
        type="checkbox"
        name={name}
        value={def.key}
        defaultChecked={selected.has(def.key)}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-fyh-text">
          {def.label}
          {def.sensitive ? (
            <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
              Sensitive
            </span>
          ) : null}
          {def.ownerOnly ? (
            <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold uppercase text-red-800">
              Owner
            </span>
          ) : null}
        </span>
        <span className="block text-fyh-text-secondary">{def.description}</span>
        <span className="block font-mono text-[10px] text-fyh-text-secondary/70">{def.key}</span>
      </span>
    </label>
  );
}

export function PermissionMatrix({ selected, name = 'permissions', sensitiveOnly = false }: Props) {
  const byModule = permissionsByModule();

  const modules = Object.keys(byModule).sort((a, b) => {
    const labelA = WORKFORCE_MODULE_LABELS[a] ?? WORKFORCE_PERMISSION_GROUP_LABELS[a as keyof typeof WORKFORCE_PERMISSION_GROUP_LABELS] ?? a;
    const labelB = WORKFORCE_MODULE_LABELS[b] ?? WORKFORCE_PERMISSION_GROUP_LABELS[b as keyof typeof WORKFORCE_PERMISSION_GROUP_LABELS] ?? b;
    return labelA.localeCompare(labelB);
  });

  return (
    <div className="max-h-[32rem] space-y-4 overflow-y-auto rounded-lg border border-[color:var(--fyh-border)] p-3">
      {modules.map((mod) => {
        const defs = byModule[mod].filter((d) =>
          sensitiveOnly ? d.sensitive || d.ownerOnly : true,
        );
        if (defs.length === 0) return null;

        const label =
          WORKFORCE_MODULE_LABELS[mod] ??
          WORKFORCE_PERMISSION_GROUP_LABELS[mod as keyof typeof WORKFORCE_PERMISSION_GROUP_LABELS] ??
          mod;

        return (
          <fieldset key={mod} className="space-y-1">
            <legend className="text-xs font-semibold uppercase tracking-wide text-fyh-text-secondary">
              {label}
            </legend>
            <div className="grid gap-0.5 sm:grid-cols-2">
              {defs.map((def) => (
                <PermissionRow key={def.key} def={def} selected={selected} name={name} />
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function EffectivePermissionsPreview({ permissions }: { permissions: string[] }) {
  const sorted = [...permissions].sort();
  return (
    <div className="rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface-muted)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-fyh-text-secondary">
        Effective permissions ({sorted.length})
      </p>
      <ul className="mt-2 max-h-40 overflow-y-auto font-mono text-[11px] text-fyh-text-secondary">
        {sorted.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
    </div>
  );
}
