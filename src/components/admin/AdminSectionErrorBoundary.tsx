'use client';

import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  title?: string;
};

type State = { hasError: boolean };

/** Keeps a failing analytics widget from taking down the whole admin overview. */
export class AdminSectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[admin-section]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 px-5 py-6 text-sm text-rose-200">
          <p className="font-semibold text-white">
            {this.props.title ?? 'This section'} could not load
          </p>
          <p className="mt-2 text-apg-silver">
            Other overview data is still available. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
          >
            Retry section
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
