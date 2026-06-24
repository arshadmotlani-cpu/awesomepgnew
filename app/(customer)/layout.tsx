import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { CockroachAI } from '@/src/components/cockroach/CockroachAI';
import { WorldShell } from '@/src/components/world';

function isCockroachGuideEnabled(): boolean {
  return process.env.COCKROACH_AI_ENABLED !== 'false';
}

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cockroachEnabled = isCockroachGuideEnabled();

  return (
    <div className="apg-customer-shell flex min-h-screen flex-col bg-apg-charcoal">
      <SiteHeader />
      <main className="flex-1">
        <WorldShell>{children}</WorldShell>
      </main>
      <SiteFooter />
      <WhatsAppSupportButton />
      <CockroachAI enabled={cockroachEnabled} />
    </div>
  );
}
