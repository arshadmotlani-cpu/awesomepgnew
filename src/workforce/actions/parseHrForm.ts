import type { UpsertEmployeeInput } from '@/src/workforce/services/employees';
import {
  validateAccountNumber,
  validateIfscCode,
  validateIncentivePlanType,
  validatePaymentMethod,
  validatePercentage,
  validatePositiveSalaryInr,
  validateSalaryFrequency,
  validateThresholdMultiplier,
  validateUpiId,
} from '@/src/workforce/lib/hrValidation';
import { parseWeekOffDays } from '@/src/workforce/lib/weekOff';
import type { WorkforceIncentivePlanInput } from '@/src/workforce/types/hr';

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export function parseHrFieldsFromForm(formData: FormData): {
  employee: Partial<UpsertEmployeeInput>;
  weekOffDays: number[];
  incentivePlan: WorkforceIncentivePlanInput;
} {
  const salaryInr = formStr(formData, 'salaryInr');
  const accountNumber = formStr(formData, 'accountNumber');
  const ifscCode = formStr(formData, 'ifscCode');
  const upiId = formStr(formData, 'upiId');

  const planType = validateIncentivePlanType(formStr(formData, 'incentivePlanType'));
  let incentivePlan: WorkforceIncentivePlanInput = {
    planType: 'none',
    config: {},
    effectiveFrom: formStr(formData, 'incentiveEffectiveFrom') || null,
  };

  if (planType === 'percentage_threshold') {
    const baseInr = formStr(formData, 'incentiveBaseSalaryInr') || salaryInr || '0';
    incentivePlan = {
      planType,
      effectiveFrom: formStr(formData, 'incentiveEffectiveFrom') || null,
      config: {
        baseSalaryPaise: validatePositiveSalaryInr(baseInr),
        thresholdMultiplier: validateThresholdMultiplier(formStr(formData, 'thresholdMultiplier') || '2'),
        aboveThresholdPercentBps: validatePercentage(
          formStr(formData, 'aboveThresholdPercent') || '10',
        ),
      },
    };
  } else if (planType === 'fixed_bonus') {
    incentivePlan = {
      planType,
      effectiveFrom: formStr(formData, 'incentiveEffectiveFrom') || null,
      config: {
        bonusPaise: validatePositiveSalaryInr(formStr(formData, 'fixedBonusInr') || '0'),
      },
    };
  }

  return {
    employee: {
      salaryPaise: salaryInr ? validatePositiveSalaryInr(salaryInr) : undefined,
      salaryFrequency: validateSalaryFrequency(formStr(formData, 'salaryFrequency')),
      salaryEffectiveFrom: formStr(formData, 'salaryEffectiveFrom') || null,
      bankAccountHolderName: formStr(formData, 'bankAccountHolderName') || null,
      bankName: formStr(formData, 'bankName') || null,
      accountNumber: validateAccountNumber(accountNumber),
      ifscCode: validateIfscCode(ifscCode),
      upiId: validateUpiId(upiId),
      qrCodeUrl: formStr(formData, 'qrCodeUrl') || null,
      primaryPaymentMethod: validatePaymentMethod(formStr(formData, 'primaryPaymentMethod')),
    },
    weekOffDays: parseWeekOffDays(formData),
    incentivePlan,
  };
}
