import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { CockroachAI } from '@/src/components/cockroach/CockroachAI';

function isCockroachAiEnabled(): boolean {
  if (process.env.COCKROACH_AI_ENABLED === 'false') return false;
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cockroachEnabled = isCockroachAiEnabled();

  return (
    <div className="flex min-h-screen flex-col bg-apg-charcoal text-[#f4f6f8]">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <WhatsAppSupportButton />
      <CockroachAI enabled={cockroachEnabled} />
    </div>
  );
}
