import Link from 'next/link';

export function SiteFooter({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const light = theme === 'light';

  return (
    <footer
      className={
        light
          ? 'mt-auto border-t border-slate-200 bg-slate-50/90'
          : 'mt-auto border-t border-white/5 bg-apg-deep/40'
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <p className={`text-sm font-semibold ${light ? 'text-slate-900' : 'text-white'}`}>
              Awesome PG
            </p>
            <p
              className={`mt-2 max-w-xs text-xs leading-relaxed ${light ? 'text-slate-600' : 'text-apg-silver'}`}
            >
              Premium paying-guest living with bed-first booking, daily cleaning, free laundry, and
              honest amenities.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-apg-orange">Explore</p>
            <ul className={`mt-3 space-y-2 text-sm ${light ? 'text-slate-600' : 'text-apg-silver'}`}>
              <li>
                <Link href="/pgs" className={light ? 'hover:text-slate-900' : 'hover:text-white'}>
                  Browse PGs
                </Link>
              </li>
              <li>
                <Link
                  href="/login?next=/account/profile"
                  className={light ? 'hover:text-slate-900' : 'hover:text-white'}
                >
                  Resident sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${light ? 'text-cyan-700' : 'text-apg-cyan'}`}>
              Living
            </p>
            <ul className={`mt-3 space-y-2 text-xs ${light ? 'text-slate-600' : 'text-apg-silver'}`}>
              <li>Gaming zones · Arcade · Chill rooms</li>
              <li>Daily cleaning · WiFi · Free laundry</li>
              <li>Gym & farmhouse (coming soon) · Vehicle resale</li>
              <li>Secure UPI payments · Transparent billing</li>
            </ul>
          </div>
        </div>
        <div
          className={`mt-10 flex flex-col items-center justify-between gap-2 border-t pt-6 text-xs sm:flex-row ${
            light ? 'border-slate-200 text-slate-500' : 'border-white/5 text-apg-muted'
          }`}
        >
          <span>© {new Date().getUTCFullYear()} Awesome PG. All rights reserved.</span>
          <span>Bed-first booking · UPI QR payments · Live awesome</span>
        </div>
      </div>
    </footer>
  );
}
