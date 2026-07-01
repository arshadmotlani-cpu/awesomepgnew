import { siteWhatsAppUrl } from '@/src/lib/siteContact';

export function WhatsAppSupportButton() {
  return (
    <a
      href={siteWhatsAppUrl()}
      target="_blank"
      rel="noopener noreferrer"
      data-roachie-tour="support"
      className="apg-support-fab fixed right-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/30 transition hover:scale-105 hover:bg-[#20bd5a]"
      style={{ marginRight: 'env(safe-area-inset-right, 0px)' }}
      aria-label="Support on WhatsApp"
    >
      <span className="text-lg leading-none">💬</span>
      Support
    </a>
  );
}
