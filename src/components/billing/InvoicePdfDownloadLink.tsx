type Props = {
  href: string;
  label?: string;
  className?: string;
};

/** Opens the SSOT invoice PDF download route (application/pdf attachment). */
export function InvoicePdfDownloadLink({
  href,
  label = 'Download PDF',
  className = 'rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50',
}: Props) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {label}
    </a>
  );
}
