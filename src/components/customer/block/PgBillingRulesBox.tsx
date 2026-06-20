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
        'rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-4 text-xs text-apg-muted shadow-sm ' +
        className
      }
    >
      <p className="text-[13px] font-semibold text-white">Stay rules</p>
      <ul className="mt-2 space-y-1">
        {RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </aside>
  );
}
