import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-apg-deep/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-white">Awesome PG</p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-apg-silver">
              Premium paying-guest living with bed-first booking, social spaces, and resident perks
              built for 2050 — available now.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-apg-orange">Explore</p>
            <ul className="mt-3 space-y-2 text-sm text-apg-silver">
              <li>
                <Link href="/pgs" className="hover:text-white">
                  Browse PGs
                </Link>
              </li>
              <li>
                <Link href="/login?next=/account/resident" className="hover:text-white">
                  Resident sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-apg-cyan">Living</p>
            <ul className="mt-3 space-y-2 text-xs text-apg-silver">
              <li>Gaming zones · Arcade · Chill rooms</li>
              <li>Gym · Farmhouse retreats · Mobility</li>
              <li>Secure UPI payments · Transparent billing</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-white/5 pt-6 text-xs text-apg-muted sm:flex-row">
          <span>© {new Date().getUTCFullYear()} Awesome PG. All rights reserved.</span>
          <span>Bed-first booking · UPI QR payments · Live awesome</span>
        </div>
      </div>
    </footer>
  );
}
