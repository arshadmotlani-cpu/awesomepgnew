'use client';

import type { RoomConfigurationPresetId } from '@/src/lib/roomConfigurationPresets';
import {
  previewBedCodesForPreset,
  ROOM_CONFIGURATION_PRESETS,
} from '@/src/lib/roomConfigurationPresets';

export function RoomTypeSelector({
  value,
  onChange,
  disabled,
}: {
  value: RoomConfigurationPresetId;
  onChange: (id: RoomConfigurationPresetId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {ROOM_CONFIGURATION_PRESETS.map((preset) => {
        const selected = value === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset.id)}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              selected
                ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 ring-1 ring-[#FF5A1F]/40'
                : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
            } disabled:opacity-50`}
          >
            <p className="font-medium text-white">{preset.label}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{preset.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export function BedPreviewList({ presetId }: { presetId: RoomConfigurationPresetId }) {
  const preset = ROOM_CONFIGURATION_PRESETS.find((p) => p.id === presetId)!;
  const codes = previewBedCodesForPreset(preset);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Beds created automatically
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {codes.map((code) => (
          <span
            key={code}
            className="inline-flex min-w-[3rem] items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
          >
            {code}
          </span>
        ))}
      </div>
    </div>
  );
}
