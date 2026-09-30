import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { CustomerSessionRefresh } from '@/src/components/auth/CustomerSessionRefresh';
import { ImpersonationBanner } from '@/src/components/auth/ImpersonationBanner';
import { ImpersonationDebugPanel } from '@/src/components/auth/ImpersonationDebugPanel';
import { PostLoginGlobalErrorObserver } from '@/src/components/customer/account/PostLoginGlobalErrorObserver';
import { WorldShell } from '@/src/components/world';
import { getActiveImpersonationContext } from '@/src/lib/auth/impersonation';
import { getCustomerSession } from '@/src/lib/auth/session';

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
