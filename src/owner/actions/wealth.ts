'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwnerAuth } from '@/src/owner/lib/auth/guards';
import type { ExpenseCategory, LiabilityType } from '@/src/owner/lib/wealth/types';
import { createFinancialAccount } from '@/src/owner/services/financialAccounts';
import { createManualExpense, createManualIncome } from '@/src/owner/services/expenses';
import { createProperty, addPropertyValuation } from '@/src/owner/services/properties';
import {
  createPropertyIncomeSource,
  updatePropertyIncomeSource,
  changePropertyIncomeRent,
  deletePropertyIncomeSource,
} from '@/src/owner/services/propertyIncomeSources';
import type {
  PropertyIncomeSourceType,
  PropertyIncomeSourceStatus,
} from '@/src/owner/lib/wealth/propertyIncomeTypes';
import { createLiability, payLiability } from '@/src/owner/services/liabilities';
import { syncAllEngineFacts } from '@/src/owner/services/integrationSync';
import {
  createRecurringObligation,
  listRecurringObligations,
} from '@/src/owner/services/recurringObligations';

export type WealthActionState = { error?: string; success?: string };

export async function createAccountAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    const name = String(formData.get('name') ?? '');
    const openingBalance = Number(formData.get('openingBalanceRupees') ?? 0);
    await createFinancialAccount({
      name,
      openingBalancePaise: Math.round(openingBalance * 100),
      createdBy: admin.id,
    });
    revalidatePath('/accounts');
    revalidatePath('/dashboard');
    return { success: 'Account created' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create account' };
  }
}

export async function createExpenseAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    await createManualExpense({
      amountRupees: Number(formData.get('amountRupees') ?? 0),
      expenseDate: String(formData.get('expenseDate') ?? ''),
      description: String(formData.get('description') ?? ''),
      category: String(formData.get('category') ?? 'OTHER') as ExpenseCategory,
      subcategory: String(formData.get('subcategory') ?? '') || null,
      accountId: String(formData.get('accountId') ?? '') || null,
      assetId: String(formData.get('assetId') ?? '') || null,
      liabilityId: String(formData.get('liabilityId') ?? '') || null,
      notes: String(formData.get('notes') ?? '') || null,
      createdBy: admin.id,
    });
    revalidatePath('/expenses');
    revalidatePath('/dashboard');
    return { success: 'Expense recorded' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record expense' };
  }
}

export async function createPropertyAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();

    const breakdown = {
      registration: Number(formData.get('registrationRupees') ?? 0),
      stampDuty: Number(formData.get('stampDutyRupees') ?? 0),
      legalFees: Number(formData.get('legalFeesRupees') ?? 0),
      brokerage: Number(formData.get('brokerageRupees') ?? 0),
      renovation: Number(formData.get('renovationRupees') ?? 0),
      other: Number(formData.get('otherAcquisitionRupees') ?? 0),
    };
    const breakdownTotal = Object.values(breakdown).reduce((s, v) => s + v, 0);
    const directCosts = Number(formData.get('purchaseCostsRupees') ?? 0);
    const purchaseCostsRupees = breakdownTotal > 0 ? breakdownTotal : directCosts;

    const linkedPgId = String(formData.get('linkedPgId') ?? '') || null;

    let incomeSources: Array<{
      sourceType: PropertyIncomeSourceType;
      name: string;
      tenantName?: string | null;
      monthlyAmountRupees: number;
      securityDepositRupees?: number;
      startDate?: string | null;
      status?: PropertyIncomeSourceStatus;
      notes?: string | null;
    }> = [];
    const incomeSourcesJson = String(formData.get('incomeSourcesJson') ?? '').trim();
    if (incomeSourcesJson) {
      incomeSources = JSON.parse(incomeSourcesJson) as typeof incomeSources;
    }

    await createProperty({
      name: String(formData.get('name') ?? ''),
      propertyType: String(formData.get('propertyType') ?? 'residential'),
      address: String(formData.get('address') ?? '') || null,
      city: String(formData.get('city') ?? '') || null,
      state: String(formData.get('state') ?? '') || null,
      country: String(formData.get('country') ?? '') || null,
      postalCode: String(formData.get('postalCode') ?? '') || null,
      purchaseDate: String(formData.get('purchaseDate') ?? '') || null,
      purchasePriceRupees: Number(formData.get('purchasePriceRupees') ?? 0),
      purchaseCostsRupees,
      purchaseCostsBreakdown: breakdownTotal > 0 ? breakdown : undefined,
      ownershipPct: Number(formData.get('ownershipPct') ?? 100),
      linkedPgId,
      appreciationMethod: String(formData.get('appreciationMethod') ?? 'FLAT_ANNUAL'),
      annualAppreciationPct: formData.get('annualAppreciationPct')
        ? Number(formData.get('annualAppreciationPct'))
        : null,
      currentValueRupees: formData.get('currentValueRupees')
        ? Number(formData.get('currentValueRupees'))
        : null,
      valuationDate: String(formData.get('valuationDate') ?? '') || null,
      monthlyRentalIncomeRupees: Number(formData.get('monthlyRentalIncomeRupees') ?? 0),
      otherMonthlyIncomeRupees: Number(formData.get('otherMonthlyIncomeRupees') ?? 0),
      incomeSources,
      notes: String(formData.get('notes') ?? '') || null,
      createdBy: admin.id,
    });
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    return { success: 'Property created' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create property' };
  }
}

export async function createIncomeAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    await createManualIncome({
      amountRupees: Number(formData.get('amountRupees') ?? 0),
      incomeDate: String(formData.get('incomeDate') ?? ''),
      description: String(formData.get('description') ?? ''),
      accountId: String(formData.get('accountId') ?? '') || null,
      assetId: String(formData.get('assetId') ?? '') || null,
      notes: String(formData.get('notes') ?? '') || null,
      createdBy: admin.id,
    });
    revalidatePath('/income');
    revalidatePath('/dashboard');
    return { success: 'Income recorded' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record income' };
  }
}

export async function createPropertyExpenseAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    const assetId = String(formData.get('assetId') ?? '') || null;
    const frequency = String(formData.get('frequency') ?? 'ONE_TIME');

    if (frequency !== 'ONE_TIME') {
      await createRecurringObligation({
        name: String(formData.get('description') ?? 'Property expense'),
        amountRupees: Number(formData.get('amountRupees') ?? 0),
        frequency: frequency as 'MONTHLY' | 'YEARLY' | 'QUARTERLY',
        category: String(formData.get('category') ?? 'PROPERTY') as ExpenseCategory,
        assetId,
        nextDueDate: String(formData.get('expenseDate') ?? '') || null,
        notes: String(formData.get('notes') ?? '') || null,
        createdBy: admin.id,
      });
    } else {
      await createManualExpense({
        amountRupees: Number(formData.get('amountRupees') ?? 0),
        expenseDate: String(formData.get('expenseDate') ?? ''),
        description: String(formData.get('description') ?? ''),
        category: String(formData.get('category') ?? 'PROPERTY') as ExpenseCategory,
        assetId,
        accountId: String(formData.get('accountId') ?? '') || null,
        notes: String(formData.get('notes') ?? '') || null,
        createdBy: admin.id,
      });
    }

    if (assetId) revalidatePath(`/assets/${assetId}`);
    revalidatePath('/expenses');
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    return { success: 'Expense recorded' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record expense' };
  }
}

export async function createPropertyIncomeSourceAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    const assetId = String(formData.get('assetId') ?? '');
    await createPropertyIncomeSource({
      assetId,
      sourceType: String(formData.get('sourceType') ?? 'SHOP') as PropertyIncomeSourceType,
      name: String(formData.get('name') ?? ''),
      tenantName: String(formData.get('tenantName') ?? '') || null,
      monthlyAmountRupees: Number(formData.get('monthlyAmountRupees') ?? 0),
      securityDepositRupees: Number(formData.get('securityDepositRupees') ?? 0),
      startDate: String(formData.get('startDate') ?? '') || null,
      status: (String(formData.get('status') ?? 'ACTIVE') as PropertyIncomeSourceStatus),
      notes: String(formData.get('notes') ?? '') || null,
      createdBy: admin.id,
    });
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidatePath('/income');
    return { success: 'Income source added' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to add income source' };
  }
}

export async function updatePropertyIncomeSourceAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    const id = String(formData.get('id') ?? '');
    const assetId = String(formData.get('assetId') ?? '');
    await updatePropertyIncomeSource({
      id,
      name: String(formData.get('name') ?? ''),
      tenantName: String(formData.get('tenantName') ?? '') || null,
      status: String(formData.get('status') ?? 'ACTIVE') as PropertyIncomeSourceStatus,
      notes: String(formData.get('notes') ?? '') || null,
      actorId: admin.id,
    });
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/dashboard');
    return { success: 'Income source updated' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update income source' };
  }
}

export async function changePropertyIncomeRentAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    const assetId = String(formData.get('assetId') ?? '');
    await changePropertyIncomeRent({
      incomeSourceId: String(formData.get('incomeSourceId') ?? ''),
      monthlyAmountRupees: Number(formData.get('monthlyAmountRupees') ?? 0),
      effectiveFrom: String(formData.get('effectiveFrom') ?? ''),
      notes: String(formData.get('notes') ?? '') || null,
      actorId: admin.id,
    });
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/dashboard');
    return { success: 'Rent updated' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update rent' };
  }
}

export async function deletePropertyIncomeSourceAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    const id = String(formData.get('id') ?? '');
    const assetId = String(formData.get('assetId') ?? '');
    await deletePropertyIncomeSource({ id, actorId: admin.id });
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/dashboard');
    return { success: 'Income source removed' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to remove income source' };
  }
}

export async function addValuationAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    const assetId = String(formData.get('assetId') ?? '');
    await addPropertyValuation({
      assetId,
      valueRupees: Number(formData.get('valueRupees') ?? 0),
      valuationDate: String(formData.get('valuationDate') ?? ''),
      kind: (String(formData.get('kind') ?? 'MARKET_ESTIMATE') as
        | 'ACTUAL'
        | 'APPRAISAL'
        | 'MARKET_ESTIMATE'),
      notes: String(formData.get('notes') ?? '') || null,
      createdBy: admin.id,
    });
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/assets');
    return { success: 'Valuation added' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to add valuation' };
  }
}

export async function createLiabilityAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    const row = await createLiability({
      name: String(formData.get('name') ?? ''),
      lender: String(formData.get('lender') ?? '') || null,
      liabilityType: String(formData.get('liabilityType') ?? 'EMI') as LiabilityType,
      originalPrincipalRupees: Number(formData.get('originalPrincipalRupees') ?? 0),
      currentPrincipalRupees: formData.get('currentPrincipalRupees')
        ? Number(formData.get('currentPrincipalRupees'))
        : undefined,
      interestRatePct: Number(formData.get('interestRatePct') ?? 0),
      startDate: String(formData.get('startDate') ?? '') || null,
      tenureMonths: formData.get('tenureMonths') ? Number(formData.get('tenureMonths')) : null,
      fixedPaymentRupees: formData.get('fixedPaymentRupees')
        ? Number(formData.get('fixedPaymentRupees'))
        : null,
      assetId: String(formData.get('assetId') ?? '') || null,
      notes: String(formData.get('notes') ?? '') || null,
      createdBy: admin.id,
    });
    revalidatePath('/liabilities');
    revalidatePath('/dashboard');
    redirect(`/liabilities/${row.id}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create liability' };
  }
}

export async function payLiabilityAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    const liabilityId = String(formData.get('liabilityId') ?? '');
    await payLiability({
      liabilityId,
      amountRupees: Number(formData.get('amountRupees') ?? 0),
      paymentDate: String(formData.get('paymentDate') ?? ''),
      accountId: String(formData.get('accountId') ?? '') || null,
      allocationMode: (String(formData.get('allocationMode') ?? 'AUTO') as 'AUTO' | 'MANUAL'),
      manualInterestRupees: formData.get('manualInterestRupees')
        ? Number(formData.get('manualInterestRupees'))
        : undefined,
      manualPrincipalRupees: formData.get('manualPrincipalRupees')
        ? Number(formData.get('manualPrincipalRupees'))
        : undefined,
      notes: String(formData.get('notes') ?? '') || null,
      createdBy: admin.id,
    });
    revalidatePath(`/liabilities/${liabilityId}`);
    revalidatePath('/liabilities');
    revalidatePath('/dashboard');
    return { success: 'Payment recorded' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record payment' };
  }
}

export async function syncIntegrationsAction(): Promise<WealthActionState> {
  try {
    await requireOwnerAuth();
    const results = await syncAllEngineFacts();
    revalidatePath('/integrations');
    revalidatePath('/dashboard');
    revalidatePath('/expenses');
    const summary = results
      .map((r) => `${r.sourceSystem}: ${r.factsUpserted} facts`)
      .join(', ');
    return { success: `Synced — ${summary}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Sync failed' };
  }
}

export async function createRecurringObligationAction(
  _prev: WealthActionState,
  formData: FormData,
): Promise<WealthActionState> {
  try {
    const admin = await requireOwnerAuth();
    await createRecurringObligation({
      name: String(formData.get('name') ?? ''),
      amountRupees: Number(formData.get('amountRupees') ?? 0),
      frequency: String(formData.get('frequency') ?? 'MONTHLY') as
        | 'DAILY'
        | 'WEEKLY'
        | 'MONTHLY'
        | 'QUARTERLY'
        | 'YEARLY',
      category: String(formData.get('category') ?? 'OTHER') as ExpenseCategory,
      nextDueDate: String(formData.get('nextDueDate') ?? '') || null,
      notes: String(formData.get('notes') ?? '') || null,
      createdBy: admin.id,
    });
    revalidatePath('/integrations');
    return { success: 'Recurring obligation added' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to add obligation' };
  }
}

export async function loadRecurringObligationsAction() {
  await requireOwnerAuth();
  return listRecurringObligations();
}
