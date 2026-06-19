'use client';

import { Component, useEffect, type ReactNode } from 'react';
import type { DepositRenderSection } from '@/src/lib/depositRenderTrace';

type Props = {
  section: DepositRenderSection;
  bookingId: string;
  data?: Record<string, unknown>;
  children: ReactNode;
};

type State = { error: Error | null };

function DepositSectionMounted({
  section,
  bookingId,
}: {
  section: DepositRenderSection;
  bookingId: string;
}) {
  useEffect(() => {
    console.error('[DEPOSIT_RENDER_OK]', { section, bookingId, surface: 'client' });
    void fetch('/api/admin/deposit-render-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'ok', section, bookingId, surface: 'client' }),
      keepalive: true,
    }).catch(() => undefined);
  }, [section, bookingId]);
  return null;
}

/**
 * Per-section error boundary — reports [DEPOSIT_RENDER_FAILED] to server logs
 * so client-side render/hydration crashes are visible in Vercel.
 */
export class DepositRenderSectionBoundary extends Component<Props, State> {
  state: State = { error: null };

  componentDidMount() {
    console.error('[DEPOSIT_RENDER_START]', {
      section: this.props.section,
      bookingId: this.props.bookingId,
      data: this.props.data,
      surface: 'client',
    });
    void this.report('start');
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    const payload = {
      section: this.props.section,
      bookingId: this.props.bookingId,
      file: null as string | null,
      line: null as number | null,
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      data: this.props.data,
      surface: 'client',
    };
    console.error('[DEPOSIT_RENDER_FAILED]', payload);
    void fetch('/api/admin/deposit-render-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch((fetchErr) => {
      console.error('[DEPOSIT_RENDER_FAILED] log POST failed', fetchErr);
    });
    this.setState({ error });
  }

  private async report(phase: 'start' | 'ok') {
    try {
      await fetch('/api/admin/deposit-render-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase,
          section: this.props.section,
          bookingId: this.props.bookingId,
          data: this.props.data,
          surface: 'client',
        }),
        keepalive: true,
      });
    } catch {
      // best-effort
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="my-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <p className="font-semibold">
            Section &quot;{this.props.section}&quot; failed to render
          </p>
          <p className="mt-1 text-xs text-rose-200/90">{this.state.error.message}</p>
          <p className="mt-1 text-[10px] text-apg-silver">
            Logged as [DEPOSIT_RENDER_FAILED] — check Vercel logs for booking{' '}
            {this.props.bookingId}
          </p>
        </div>
      );
    }
    return (
      <>
        <DepositSectionMounted section={this.props.section} bookingId={this.props.bookingId} />
        {this.props.children}
      </>
    );
  }
}
