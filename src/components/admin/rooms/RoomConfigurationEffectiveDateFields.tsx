'use client';

import {
  defaultRoomConfigurationEffectiveFrom,
  minScheduledRoomConfigurationEffectiveFrom,
} from '@/src/lib/roomConfiguration/effectiveDate';
import { formatDate } from '@/src/lib/format';

export type RoomConfigurationTiming = 'immediate' | 'scheduled';

type Props = {
  today: string;
  timing: RoomConfigurationTiming;
  onTimingChange: (timing: RoomConfigurationTiming) => void;
  scheduledEffectiveFrom: string;
  onScheduledEffectiveFromChange: (date: string) => void;
  disabled?: boolean;
  editingScheduledDate?: string | null;
};

export function RoomConfigurationEffectiveDateFields({
  today,
  timing,
  onTimingChange,
  scheduledEffectiveFrom,
  onScheduledEffectiveFromChange,
  disabled = false,
  editingScheduledDate = null,
}: Props) {
  const minDate = minScheduledRoomConfigurationEffectiveFrom(today);

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm text-zinc-400">When should this take effect?</legend>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-800 px-3 py-2 hover:border-zinc-600">
          <input
            type="radio"
            name="configurationTiming"
            checked={timing === 'immediate'}
            onChange={() => onTimingChange('immediate')}
            disabled={disabled}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-white">Apply immediately</span>
            <span className="block text-xs text-zinc-500">
              Effective today ({formatDate(today)}). Configuration and pricing versions start today.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-800 px-3 py-2 hover:border-zinc-600">
          <input
            type="radio"
            name="configurationTiming"
            checked={timing === 'scheduled'}
            onChange={() => onTimingChange('scheduled')}
            disabled={disabled}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium text-white">Schedule for a date</span>
            <span className="block text-xs text-zinc-500">
              Current residents stay on today&apos;s configuration until the effective date.
            </span>
          </span>
        </label>
      </fieldset>
      {timing === 'scheduled' ? (
        <label className="block text-sm text-zinc-300">
          <span className="text-zinc-400">Financial effective date</span>
          <input
            type="date"
            value={scheduledEffectiveFrom}
            min={minDate}
            onChange={(e) => onScheduledEffectiveFromChange(e.target.value)}
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white disabled:opacity-50"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            {editingScheduledDate
              ? `Editing scheduled change from ${formatDate(editingScheduledDate)}. Pick a new date to move the entire configuration.`
              : `Default: next billing cycle (${defaultRoomConfigurationEffectiveFrom(today)}). Past dates are not allowed.`}
          </span>
        </label>
      ) : (
        <p className="text-xs text-zinc-500">
          Effective date: <span className="text-zinc-300">{formatDate(today)}</span> (today)
        </p>
      )}
    </div>
  );
}
