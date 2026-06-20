import {
  PREBOOKING_RULE_COPY,
  SHORT_STAY_RULE_COPY,
  STAY_TIMING_RULE_COPY,
  DEPOSIT_REFUND_RULE_COPY,
} from '@/src/lib/residents/stayBillingRules';

export function BillingRulesCallout({ compact = false }: { compact?: boolean }) {
  const rules = compact
    ? [STAY_TIMING_RULE_COPY, SHORT_STAY_RULE_COPY]
    : [STAY_TIMING_RULE_COPY, SHORT_STAY_RULE_COPY, PREBOOKING_RULE_COPY, DEPOSIT_REFUND_RULE_COPY];

  return (
    <aside className="rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
        Billing rules
      </h3>
      <ul className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-600">
        {rules.map((rule) => (
          <li key={rule.slice(0, 24)} className="flex gap-2">
            <span className="text-apg-orange" aria-hidden>
              •
            </span>
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
