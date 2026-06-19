'use client';

import { ApgCard } from '@/src/components/customer/design-system';

const SUGGESTED_QUESTIONS = [
  'When is my rent due?',
  'What is my deposit balance?',
  'How do I pay electricity?',
  'What is my vacating status?',
];

type Props = {
  residentName?: string;
};

export function ConciergePanel({ residentName }: Props) {
  return (
    <ApgCard tier="account" className="p-5">
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden>
          🪳
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900">AI Concierge (Roachie)</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Hi{residentName ? ` ${residentName.split(' ')[0]}` : ''}! Tap the cockroach mascot
            (bottom-left) for guided help. Roachie reads your booking and billing context — never
            other residents&apos; data.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Try asking
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <li
              key={q}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-700"
            >
              {q}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Full chat concierge is in development. For urgent help, use WhatsApp support (bottom-right).
      </p>
    </ApgCard>
  );
}
