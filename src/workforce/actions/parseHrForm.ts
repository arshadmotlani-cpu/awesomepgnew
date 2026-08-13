import type { UpsertEmployeeInput } from '@/src/workforce/services/employees';
import {
  validateAccountNumber,
  validateIfscCode,
  validatePaymentMethod,
  validatePercentage,
  validatePositiveSalaryInr,
  validateThresholdMultiplier,
  validateUpiId,
} from '@/src/workforce/lib/hrValidation';
import { parseWeekOffDays, type DayScheduleInput } from '@/src/workforce/lib/weekOff';
import { buildDefaultIncentivePlan } from '@/src/workforce/lib/salonCompensationRules';
import {
  validateAndNormalizeRules,
} from '@/src/workforce/lib/incentiveRuleEngine';
import type { SalonIncentiveRule, SalonRulesIncentiveConfig, WorkforceIncentivePlanInput } from '@/src/workforce/types/hr';

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export type ParseHrFormOptions = {
  /** When false, incentive stays enabled unless explicitly disabled by owner. */
  canToggleIncentive?: boolean;
  /** Current incentive enabled state when viewer cannot toggle. */
  defaultIncentiveEnabled?: boolean;
  /** Existing plan config for preserving rules when viewer cannot edit incentives. */
  existingIncentiveConfig?: SalonRulesIncentiveConfig | null;
};

/** Defaults for new employees — compensation configured on profile after create. */
export function parseBasicCreateHrDefaults(formData: FormData): {
  employee: Partial<UpsertEmployeeInput>;
  weekOffDays: number[];
  incentivePlan: WorkforceIncentivePlanInput;
} {
  return {
    employee: {
      salaryPaise: 0,
      salaryFrequency: 'monthly',
      bankAccountHolderName: null,
      bankName: null,
      accountNumber: null,
      ifscCode: null,
      upiId: null,
      qrCodeUrl: null,
      primaryPaymentMethod: 'upi',
    },
    weekOffDays: parseWeekOffDays(formData),
    incentivePlan: { planType: 'none', config: {}, effectiveFrom: null },
  };
}

export function parseScheduleDaysFromForm(formData: FormData): DayScheduleInput[] {
  const days: DayScheduleInput[] = [];
  for (let dow = 0; dow <= 6; dow++) {
    days.push({
      dayOfWeek: dow,
      startTime: formStr(formData, `day_${dow}_start`) || '10:00',
      endTime: formStr(formData, `day_${dow}_end`) || '19:00',
      isOff: formData.get(`day_${dow}_off`) === '1',
    });
  }
  return days;
}

function parseRulesFromForm(
  formData: FormData,
  kind: 'service' | 'product',
  salaryPaise: number,
): SalonIncentiveRule[] {
  const countRaw = formStr(formData, `${kind}RuleCount`);
  const count = countRaw ? Number(countRaw) : 0;
  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`${kind === 'service' ? 'Service' : 'Product'} incentive requires at least one rule.`);
  }

  const rules: SalonIncentiveRule[] = [];
  for (let i = 0; i < count; i++) {
    const percentRaw = formStr(formData, `${kind}Rule_${i}_percent`);
    if (!percentRaw) {
      throw new Error('Each incentive rule must have a percentage.');
    }
    const percentBps = validatePercentage(percentRaw);

    let thresholdPaise = 0;
    const useMultiplier = formData.get(`${kind}Rule_${i}_useSalaryMultiplier`) === '1';
    if (useMultiplier) {
      if (salaryPaise <= 0) {
        throw new Error('Salary is required when using a salary multiplier threshold.');
      }
      const multRaw = formStr(formData, `${kind}Rule_${i}_salaryMultiplier`) || '2';
      const mult = validateThresholdMultiplier(multRaw);
      thresholdPaise = Math.floor(salaryPaise * mult);
    } else {
      const thresholdInr = formStr(formData, `${kind}Rule_${i}_thresholdInr`);
      if (thresholdInr) {
        const n = Number(thresholdInr);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error('Performance threshold must be zero or a positive amount.');
        }
        thresholdPaise = Math.round(n * 100);
      }
    }

    rules.push({ thresholdPaise, percentBps });
  }

  return validateAndNormalizeRules(rules);
}

export function parseIncentivePlanFromForm(
  formData: FormData,
  salaryPaise: number,
  opts?: ParseHrFormOptions,
): WorkforceIncentivePlanInput {
  const canEdit = opts?.canToggleIncentive !== false;

  const preserved = formStr(formData, 'incentiveConfigPreserve');
  if (preserved && !formData.has('serviceRuleCount') && !formData.has('productRuleCount')) {
    try {
      const config = JSON.parse(preserved) as SalonRulesIncentiveConfig;
      if (!config.serviceEnabled && !config.productEnabled) {
        return { planType: 'none', config: {}, effectiveFrom: null };
      }
      return { planType: 'salon_rules', effectiveFrom: null, config };
    } catch {
      /* fall through to normal parse */
    }
  }

  if (!canEdit && opts?.existingIncentiveConfig) {
    const cfg = opts.existingIncentiveConfig;
    if (!cfg.serviceEnabled && !cfg.productEnabled) {
      return { planType: 'none', config: {}, effectiveFrom: null };
    }
    return { planType: 'salon_rules', effectiveFrom: null, config: cfg };
  }

  const serviceEnabled = formData.get('serviceIncentiveEnabled') === '1';
  const productEnabled = formData.get('productIncentiveEnabled') === '1';

  if (!serviceEnabled && !productEnabled) {
    return { planType: 'none', config: {}, effectiveFrom: null };
  }

  const config: SalonRulesIncentiveConfig = {
    serviceEnabled,
    productEnabled,
    serviceRules: serviceEnabled ? parseRulesFromForm(formData, 'service', salaryPaise) : [],
    productRules: productEnabled ? parseRulesFromForm(formData, 'product', salaryPaise) : [],
  };

  return { planType: 'salon_rules', effectiveFrom: null, config };
}

export function parseHrFieldsFromForm(
  formData: FormData,
  opts?: ParseHrFormOptions,
): {
  employee: Partial<UpsertEmployeeInput>;
  weekOffDays: number[];
  incentivePlan: WorkforceIncentivePlanInput;
} {
  const salaryInr = formStr(formData, 'salaryInr');
  const accountNumber = formStr(formData, 'accountNumber');
  const ifscCode = formStr(formData, 'ifscCode');
  const upiId = formStr(formData, 'upiId');

  const salaryPaise = salaryInr ? validatePositiveSalaryInr(salaryInr) : 0;

  let existingConfig = opts?.existingIncentiveConfig ?? null;
  if (!existingConfig && opts?.defaultIncentiveEnabled === false) {
    existingConfig = {
      serviceEnabled: false,
      productEnabled: false,
      serviceRules: [],
      productRules: [],
    };
  }

  const incentivePlan =
    formData.has('serviceIncentiveEnabled') || formData.has('productIncentiveEnabled')
      ? parseIncentivePlanFromForm(formData, salaryPaise, {
          ...opts,
          existingIncentiveConfig: existingConfig,
        })
      : buildDefaultIncentivePlan(opts?.defaultIncentiveEnabled !== false);

  return {
    employee: {
      salaryPaise: salaryInr ? salaryPaise : undefined,
      salaryFrequency: 'monthly',
      bankAccountHolderName: formStr(formData, 'bankAccountHolderName') || null,
      bankName: formStr(formData, 'bankName') || null,
      accountNumber: accountNumber ? validateAccountNumber(accountNumber) : null,
      ifscCode: ifscCode ? validateIfscCode(ifscCode) : null,
      upiId: upiId ? validateUpiId(upiId) : null,
      qrCodeUrl: formStr(formData, 'qrCodeUrl') || null,
      primaryPaymentMethod: validatePaymentMethod(formStr(formData, 'primaryPaymentMethod')),
    },
    weekOffDays: parseWeekOffDays(formData),
    incentivePlan,
  };
}
