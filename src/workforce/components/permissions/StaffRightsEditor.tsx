'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FYH_STAFF_RIGHT_SECTIONS,
  deriveStaffRightsSelection,
  keysLockedBySelection,
  staffRightsKeysForForm,
  toggleStaffRight,
  type FyhStaffRightKey,
} from '@/src/workforce/permissions/fyhStaffRightsModel';

type Props = {
  granted: readonly string[];
  name?: string;
  disabled?: boolean;
};

export function StaffRightsEditor({ granted, name = 'permissions', disabled }: Props) {
  const initial = useMemo(() => deriveStaffRightsSelection(granted), [granted]);
  const [selected, setSelected] = useState<Set<FyhStaffRightKey>>(initial);

  useEffect(() => {
    setSelected(initial);
  }, [initial]);

  const locked = keysLockedBySelection(selected);
  const formKeys = staffRightsKeysForForm(selected);

  return (
    <div className="space-y-6">
      {FYH_STAFF_RIGHT_SECTIONS.map((section) => (
        <fieldset
          key={section.id}
          className="space-y-2 rounded-lg border border-[color:var(--fyh-border)] p-3"
        >
          <legend className="px-1 text-sm font-semibold text-fyh-text">{section.title}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {section.rights.map((right) => {
              const isOn = selected.has(right.key);
              const isLocked = locked.has(right.key) && isOn;
              return (
                <label
                  key={right.key}
                  className="flex items-start gap-2 text-sm text-fyh-text"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={disabled || isLocked}
                    checked={isOn}
                    onChange={(e) => {
                      setSelected((prev) => toggleStaffRight(prev, right.key, e.target.checked));
                    }}
                  />
                  <span>
                    {right.label}
                    {isLocked ? (
                      <span className="ml-1 text-xs text-fyh-text-secondary">(included)</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {formKeys.map((key) => (
        <input key={key} type="hidden" name={name} value={key} />
      ))}
    </div>
  );
}
