/** Sale Express entry intent — orchestration only; domain records stay canonical. */
export type ExpressBookingSaleIntent = 'sale' | 'manual_onboarding';

export function allowsCustomDepositOverride(intent: ExpressBookingSaleIntent): boolean {
  return intent === 'manual_onboarding';
}

export function saleIntentLabel(intent: ExpressBookingSaleIntent): string {
  return intent === 'manual_onboarding' ? 'New resident / manual onboarding' : 'Rent & walk-in sale';
}
