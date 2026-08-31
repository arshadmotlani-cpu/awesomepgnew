'use client';

import { WORKFORCE_WEEKDAY_LABELS, WORKFORCE_WEEKDAY_ORDER } from '@/src/workforce/types/hr';

type Props = {
  name?: string;
  offDays: number[];
  onChange: (offDays: number[]) => void;
  readOnly?: boolean;
  /** When true, checkboxes use name= for native form submission (legacy). */
  useFormNames?: boolean;
};

export function WeekOffPicker({
  name = 'weekOff',
  offDays,
  onChange,
  readOnly = false,
  useFormNames = true,
}: Props) {
  const offSet = new Set(offDays);

  if (readOnly) {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Weekly off days</legend>
        <p className="text-sm text-fyh-text-secondary">
          {offDays.length === 0
            ? 'None'
            : offDays.map((d) => WORKFORCE_WEEKDAY_LABELS[d]).join(', ')}
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Weekly off days</legend>
      <div className="flex flex-wrap gap-3">
        {WORKFORCE_WEEKDAY_ORDER.map((day) => (
          <label key={day} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={useFormNames ? name : undefined}
              value={String(day)}
              checked={offSet.has(day)}
              className="h-4 w-4"
              onChange={(e) => {
                const next = new Set(offDays);
                if (e.target.checked) next.add(day);
                else next.delete(day);
                onChange([...next].sort((a, b) => a - b));
              }}
            />
            <span>{WORKFORCE_WEEKDAY_LABELS[day]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
