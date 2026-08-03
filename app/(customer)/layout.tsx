import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { CustomerSessionRefresh } from '@/src/components/auth/CustomerSessionRefresh';
import { ImpersonationBanner } from '@/src/components/auth/ImpersonationBanner';
import { ImpersonationDebugPanel } from '@/src/components/auth/ImpersonationDebugPanel';
import { PostLoginGlobalErrorObserver } from '@/src/components/customer/account/PostLoginGlobalErrorObserver';
import { CockroachAI } from '@/src/components/cockroach/CockroachAI';
import { WorldShell } from '@/src/components/world';
import { getActiveImpersonationContext } from '@/src/lib/auth/impersonation';
import { getCustomerSession } from '@/src/lib/auth/session';

function isCockroachGuideEnabled(): boolean {
  return process.env.COCKROACH_AI_ENABLED !== 'false';
}

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cockroachEnabled = isCockroachGuideEnabled();
  const [impersonation, customerSession] = await Promise.all([
    getActiveImpersonationContext(),
    getCustomerSession(),
  ]);

  return (
    <div className="apg-customer-shell flex min-h-screen flex-col bg-apg-charcoal">
      {impersonation ? <ImpersonationBanner context={impersonation} /> : null}
      <SiteHeader />
      <CustomerSessionRefresh />
      <PostLoginGlobalErrorObserver />
      <main className="flex-1">
        <WorldShell>{children}</WorldShell>
      </main>
      <SiteFooter />
      <WhatsAppSupportButton />
      <CockroachAI enabled={cockroachEnabled} />
      {impersonation ? (
        <ImpersonationDebugPanel
          context={impersonation}
          customerSessionId={customerSession?.sessionId ?? null}
          sessionExpiresAt={customerSession?.expiresAt.toISOString() ?? null}
        />
      ) : null}
    </div>
  );
}
