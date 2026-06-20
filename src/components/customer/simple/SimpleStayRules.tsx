/** Plain-language stay rules — shown during booking. */
export const SIMPLE_STAY_RULES =
  'Your stay works like this: You check in at 11 AM and stay until 11 AM next day. Even if you come late at night, it still counts as full day.';

export function SimpleStayRules({ className = '' }: { className?: string }) {
  return (
    <div
      className={
        'rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-4 text-sm leading-relaxed text-sky-100 ' +
        className
      }
    >
      <p className="font-semibold text-white">How your stay works</p>
      <p className="mt-2">{SIMPLE_STAY_RULES}</p>
    </div>
  );
}
