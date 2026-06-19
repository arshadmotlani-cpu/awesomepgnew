'use client';

type SignupStep = 'otp' | 'profile' | 'password';

type Props = {
  current: SignupStep;
  theme?: 'light' | 'dark';
};

export function SignupProgress({ current, theme = 'light' }: Props) {
  const dark = theme === 'dark';
  const steps = [
    { id: 'otp' as const, label: 'Email verified' },
    { id: 'profile' as const, label: 'Tell us about yourself' },
    { id: 'password' as const, label: 'Create password' },
  ];

  const currentIndex = steps.findIndex((s) => s.id === current);

  return (
    <ol className="mb-4 space-y-2" aria-label="Sign up progress">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const muted = dark ? 'text-apg-silver' : 'text-zinc-500';
        const activeText = dark ? 'text-white' : 'text-zinc-900';
        const doneText = dark ? 'text-emerald-300' : 'text-emerald-700';

        return (
          <li
            key={step.id}
            className={`flex items-center gap-2 text-sm ${
              done ? doneText : active ? activeText : muted
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? dark
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-emerald-100 text-emerald-700'
                  : active
                    ? dark
                      ? 'border border-apg-orange text-apg-orange'
                      : 'border border-indigo-600 text-indigo-600'
                    : dark
                      ? 'border border-apg-muted text-apg-muted'
                      : 'border border-zinc-300 text-zinc-400'
              }`}
              aria-hidden
            >
              {done ? '✓' : index + 1}
            </span>
            <span className={active ? 'font-medium' : undefined}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
