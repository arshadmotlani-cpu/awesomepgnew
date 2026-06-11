export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-white/5">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-apg-silver sm:flex-row sm:px-6">
        <span>© {new Date().getUTCFullYear()} Awesome PG.</span>
        <span className="text-apg-silver/70">
          Bed-first booking · UPI QR payments
        </span>
      </div>
    </footer>
  );
}
