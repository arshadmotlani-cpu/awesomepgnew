'use client';

import { Component, type ReactNode } from 'react';
import { logResidentClientError } from '@/src/lib/client/residentClientLogger';

type Props = {
  children: ReactNode;
  page: string;
  bookingId?: string | null;
  customerId?: string | null;
  title?: string;
};

type State = { hasError: boolean; errorMessage: string | null };

/** Prevents resident sub-pages from showing Next.js white-screen crashes. */
export class ResidentSectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Unexpected error' };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    logResidentClientError('resident section render failed', error, {
      page: this.props.page,
      bookingId: this.props.bookingId,
      customerId: this.props.customerId,
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-5">
          <p className="text-sm font-semibold text-rose-900">
            {this.props.title ?? 'This page could not load'}
          </p>
          <p className="mt-2 text-sm text-rose-800">
            Something went wrong while opening this screen. Your booking and deposit are safe —
            please try again. If the problem continues, contact the PG office with a screenshot.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: null })}
            className="mt-4 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
