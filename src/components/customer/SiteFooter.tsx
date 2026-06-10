export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:px-6">
        <span>© {new Date().getUTCFullYear()} Awesome PG.</span>
        <span className="text-zinc-400">
          Bed-first booking · secured by Razorpay
        </span>
      </div>
    </footer>
  );
}
