import type { AutomationEventType } from '@/src/db/schema/automationEvents';

export type AutomationActionPlan = {
  channel: 'whatsapp' | 'email' | 'sms';
  recipient: 'resident' | 'owner' | 'admin';
  templateType: string;
};

/** Hardcoded rules: event → channels & templates. No billing math here. */
export const AUTOMATION_RULES: Record<AutomationEventType, AutomationActionPlan[]> = {
  rent_due: [
    { channel: 'whatsapp', recipient: 'resident', templateType: 'rent_reminder' },
    { channel: 'email', recipient: 'resident', templateType: 'rent_reminder' },
  ],
  rent_overdue: [
    { channel: 'whatsapp', recipient: 'resident', templateType: 'rent_overdue' },
    { channel: 'email', recipient: 'admin', templateType: 'rent_overdue_admin' },
  ],
  electricity_due: [
    { channel: 'whatsapp', recipient: 'resident', templateType: 'electricity_reminder' },
    { channel: 'email', recipient: 'resident', templateType: 'electricity_reminder' },
  ],
  electricity_overdue: [
    { channel: 'whatsapp', recipient: 'resident', templateType: 'electricity_overdue' },
    { channel: 'email', recipient: 'resident', templateType: 'electricity_overdue' },
  ],
  vacating_notice: [
    { channel: 'whatsapp', recipient: 'resident', templateType: 'vacating_notice' },
    { channel: 'email', recipient: 'admin', templateType: 'vacating_notice' },
  ],
  checkin: [
    { channel: 'email', recipient: 'resident', templateType: 'checkin_reminder' },
  ],
  checkout: [
    { channel: 'email', recipient: 'resident', templateType: 'checkout_reminder' },
  ],
  kyc_pending: [
    { channel: 'whatsapp', recipient: 'resident', templateType: 'kyc_reminder' },
    { channel: 'email', recipient: 'resident', templateType: 'kyc_reminder' },
  ],
  payment_received: [
    { channel: 'email', recipient: 'resident', templateType: 'payment_confirmation' },
    { channel: 'whatsapp', recipient: 'resident', templateType: 'payment_confirmation' },
  ],
  deposit_pending_refund: [
    { channel: 'email', recipient: 'resident', templateType: 'deposit_refund_pending' },
    { channel: 'email', recipient: 'admin', templateType: 'deposit_refund_pending' },
  ],
};
