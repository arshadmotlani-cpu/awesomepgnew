'use client';

import { Component, type ReactNode } from 'react';
import {
  logDepositComponentFailed,
  logDepositComponentRender,
  throwSite,
  type DepositInvestigationContext,
} from '@/src/lib/depositInvestigation';
import { jsonSafe } from '@/src/lib/depositPageDebug';

type Props = DepositInvestigationContext & {
  sourceFile?: string;
  data?: Record<string, unknown>;
  children: ReactNode;
};

type State = { error: Error | null };

async function postToServer(payload: Record<string, unknown>) {
  try {
    await fetch('/api/admin/deposit-render-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonSafe(payload)),
      keepalive: true,
    });
  } catch {
    // best-effort
  }
}

/**
 * Per-component error boundary for deposit page production investigation.
 */
export class DepositComponentBoundary extends Component<Props, State> {
  state: State = { error: null };

  componentDidMount() {
    const invCtx = this.investigationContext();
    logDepositComponentRender(invCtx, this.props.data);
    void postToServer({
      tag: '[DEPOSIT_COMPONENT_RENDER]',
      ...invCtx,
      sourceFile: this.props.sourceFile ?? null,
      data: this.props.data ?? null,
      surface: 'client',
    });
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    const invCtx = this.investigationContext();
    const site = throwSite(error);
    logDepositComponentFailed(invCtx, error, {
      ...(this.props.data ?? {}),
      componentStack: info.componentStack ?? null,
    });
    void postToServer({
      tag: '[DEPOSIT_COMPONENT_FAILED]',
      ...invCtx,
      sourceFile: this.props.sourceFile ?? site.file,
      line: site.line,
      file: site.file,
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      data: this.props.data ?? null,
      surface: 'client',
    });
    this.setState({ error });
  }

  private investigationContext(): DepositInvestigationContext {
    return {
      bookingId: this.props.bookingId,
      bookingCode: this.props.bookingCode,
      customerId: this.props.customerId,
      component: this.props.component,
    };
  }

  render() {
    if (this.state.error) {
      const site = throwSite(this.state.error);
      return (
        <div className="my-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <p className="font-semibold">[DEPOSIT_COMPONENT_FAILED]</p>
          <p className="mt-1">
            Component: <code className="text-rose-50">{this.props.component}</code>
          </p>
          {this.props.sourceFile ? (
            <p className="mt-1 text-xs text-rose-200/90">File: {this.props.sourceFile}</p>
          ) : null}
          {site.file ? (
            <p className="mt-1 text-xs text-rose-200/90">
              Throw site: {site.file}:{site.line}
            </p>
          ) : null}
          <p className="mt-1 text-xs">{this.state.error.message}</p>
          {this.state.error.stack ? (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-rose-200/80">
              {this.state.error.stack}
            </pre>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
}
