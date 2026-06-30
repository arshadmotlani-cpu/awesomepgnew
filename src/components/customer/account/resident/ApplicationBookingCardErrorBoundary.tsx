'use client';

import { Component, type ReactNode } from 'react';
import { logResidentClientError } from '@/src/lib/client/residentClientLogger';

type Props = {
  children: ReactNode;
  bookingId: string;
  bookingCode?: string | null;
  customerId?: string | null;
  email?: string | null;
};

type State = { hasError: boolean };

/** Isolates a single booking row so corrupt data cannot blank My Bookings. */
export class ApplicationBookingCardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    logResidentClientError('my bookings card render failed', error, {
      page: 'account_bookings_card',
      bookingId: this.props.bookingId,
      customerId: this.props.customerId,
      email: this.props.email,
      extra: {
        bookingCode: this.props.bookingCode,
        componentStack: info.componentStack,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <li className="px-4 py-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">This booking could not be displayed</p>
            <p className="mt-1 text-amber-900">
              {this.props.bookingCode
                ? `Booking ${this.props.bookingCode} has incomplete data.`
                : 'One booking on your account has incomplete data.'}{' '}
              Contact the PG office if this keeps appearing.
            </p>
          </div>
        </li>
      );
    }

    return this.props.children;
  }
}
