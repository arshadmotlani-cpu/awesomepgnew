'use client';

import type { ReactNode } from 'react';
import { Component } from 'react';
import { logPaymentClientException } from '@/src/lib/client/paymentClientLogger';

type Props = {
  page: string;
  invoiceId?: string | null;
  bookingId?: string | null;
  bookingCode?: string | null;
  residentId?: string | null;
  paymentLinkId?: string | null;
  membershipId?: string | null;
  extensionId?: string | null;
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class PaymentFlowErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    logPaymentClientException('Payment flow render crash', error, {
      page: this.props.page,
      invoiceId: this.props.invoiceId,
      bookingId: this.props.bookingId,
      bookingCode: this.props.bookingCode,
      residentId: this.props.residentId,
      paymentLinkId: this.props.paymentLinkId,
      membershipId: this.props.membershipId,
      extensionId: this.props.extensionId,
    });
    if (info.componentStack) {
      console.error('[payment-boundary] component stack', info.componentStack);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900">
        <h2 className="text-sm font-semibold">Payment page temporarily unavailable</h2>
        <p className="mt-2 text-sm">
          Something went wrong while loading this payment step. Please retry safely.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-900"
          >
            Go back
          </button>
        </div>
      </section>
    );
  }
}
