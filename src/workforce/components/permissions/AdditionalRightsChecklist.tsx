'use client';

import { additionalRightsDefs } from '@/src/workforce/permissions/additionalRights';
import type { WorkforcePermissionKey } from '@/src/workforce/types';

type Props = {
  selected: Iterable<WorkforcePermissionKey | string>;
  name?: string;
  disabled?: boolean;
};

export function AdditionalRightsChecklist({ selected, name = 'permissions', disabled }: Props) {
  const selectedSet = new Set(selected);

  return (
    <div className="space-y-3">
      {additionalRightsDefs().map((def) => (
        <label key={def.key} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name={name}
            value={def.key}
            defaultChecked={selectedSet.has(def.key)}
            disabled={disabled}
            className="mt-1"
          />
          <span>
            <span className="font-medium">{def.label}</span>
            <span className="mt-0.5 block text-xs text-fyh-text-secondary">({def.description})</span>
          </span>
        </label>
      ))}
    </div>
  );
}
