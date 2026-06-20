import { STAY_CHECK_IN_TIME, STAY_CHECK_OUT_TIME } from '@/src/lib/residents/stayBillingRules';

const RULES = [
  `Check-in: ${STAY_CHECK_IN_TIME}`,
  `Check-out: ${STAY_CHECK_OUT_TIME} next day`,
  'Billing cycle: 11 AM → 11 AM',
  'Late check-in still counts as a full cycle',
];

export function PgBillingRulesBox({ className = '' }: { className?: string }) {
  return (
    <aside
      className={
        'rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-apg-silver ' +
        className
      }
    >
      <p className="font-semibold text-white">Stay rules</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </aside>
  );
}
