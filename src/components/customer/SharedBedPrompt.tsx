'use client';

import { sharedBedPromptCopy, type SharedBedPromptState } from '@/src/lib/booking/sharedBedPrompt';

type Props = {
  state: Extract<SharedBedPromptState, { phase: 'open' }>;
  onSelect: () => void;
  onClose: () => void;
};

export function SharedBedPrompt({ state, onSelect, onClose }: Props) {
  const copy = sharedBedPromptCopy(state);
  const bedLine = state.bedCode
    ? `${state.roomLabel} · Bed ${state.bedCode}`
    : state.roomLabel;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        aria-label="Dismiss shared bed"
        className="pointer-events-auto absolute inset-0 bg-black/35"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shared-bed-prompt-title"
        className="pointer-events-auto relative mb-2 w-full max-w-sm rounded-[22px] border border-white/10 bg-[#1c1c1e]/95 p-5 text-white shadow-2xl backdrop-blur-md"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
        <h2 id="shared-bed-prompt-title" className="pr-8 text-base font-semibold">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm font-medium text-white/90">{bedLine}</p>
        <p className="mt-1 text-sm text-white/70">{copy.detail}</p>
        {state.canSelect ? (
          <button
            type="button"
            onClick={onSelect}
            data-shared-bed-select="true"
            className="mt-4 w-full rounded-xl bg-apg-orange py-2.5 text-sm font-semibold text-white"
          >
            Select Bed
          </button>
        ) : null}
      </div>
    </div>
  );
}
