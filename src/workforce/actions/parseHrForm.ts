import type { UpsertEmployeeInput } from '@/src/workforce/services/employees';
import {
  validateAccountNumber,
  validateIfscCode,
  validatePaymentMethod,
  validatePositiveSalaryInr,
  validateUpiId,
} from '@/src/workforce/lib/hrValidation';
import { parseWeekOffDays } from '@/src/workforce/lib/weekOff';
import { buildIncentivePlanFromSalary } from '@/src/workforce/lib/salonCompensationRules';
import type { WorkforceIncentivePlanInput } from '@/src/workforce/types/hr';

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export type ParseHrFormOptions = {
  /** When false, incentive stays enabled unless explicitly disabled by owner. */
  canToggleIncentive?: boolean;
  /** Current incentive enabled state when viewer cannot toggle. */
  defaultIncentiveEnabled?: boolean;
};

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

  const salaryPaise = salaryInr ? validatePositiveSalaryInr(salaryInr) : undefined;

  let incentiveEnabled = opts?.defaultIncentiveEnabled !== false;
  if (opts?.canToggleIncentive) {
    incentiveEnabled = formData.get('incentiveEnabled') === '1';
  } else if (formData.has('incentiveEnabled')) {
    incentiveEnabled = formData.get('incentiveEnabled') === '1';
  }

  const incentivePlan = buildIncentivePlanFromSalary(salaryPaise ?? 0, incentiveEnabled);

  return {
    employee: {
      salaryPaise,
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
