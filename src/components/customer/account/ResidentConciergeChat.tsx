'use client';

import { useCallback, useState } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import {
  answerConciergeQuestion,
  type ConciergeContext,
} from '@/src/lib/concierge/answers';

type Message = { role: 'user' | 'assistant'; text: string };

const STARTERS = [
  'When is my rent due?',
  'What is my deposit balance?',
  'How do I pay electricity?',
  'What is my vacating status?',
];

type Props = {
  context: ConciergeContext;
};

export function ResidentConciergeChat({ context }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: `Hi ${context.residentName.split(' ')[0]}! I'm Roachie — ask me about your rent, deposit, electricity, or vacating. I only see your account data.`,
    },
  ]);
  const [input, setInput] = useState('');

  const ask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: trimmed },
        { role: 'assistant', text: answerConciergeQuestion(trimmed, context) },
      ]);
      setInput('');
    },
    [context],
  );

  return (
    <ApgCard tier="account" className="flex flex-col p-0 overflow-hidden">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-900">AI Concierge</h3>
        <p className="text-xs text-zinc-500">Scoped to your resident data only</p>
      </div>
      <div className="max-h-80 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`rounded-xl px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'ml-8 bg-apg-orange/10 text-zinc-900'
                : 'mr-8 bg-zinc-100 text-zinc-800'
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-200 px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {STARTERS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-700 hover:border-apg-orange/40"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about rent, deposit, electricity…"
            className="min-h-[44px] flex-1 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900"
          />
          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-apg-orange px-4 text-sm font-semibold text-white"
          >
            Ask
          </button>
        </form>
      </div>
    </ApgCard>
  );
}
