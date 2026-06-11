'use client';

export function PaymentScreenshotPreview({
  url,
  alt = 'Payment screenshot',
  className = 'h-40 w-full max-w-xs rounded-lg border border-zinc-700 object-contain bg-black/40',
}: {
  url: string;
  alt?: string;
  className?: string;
}) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className={className} />
      <span className="mt-1 block text-xs text-[#FF5A1F] underline">Open full size</span>
    </a>
  );
}
