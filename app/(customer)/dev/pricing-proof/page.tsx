'use client';

import { BookingReviewCard } from '@/src/components/customer/checkout/BookingReviewCard';
import { BookingCheckoutExperience } from '@/src/components/customer/checkout/BookingCheckoutExperience';
import { computeNewBookingCheckoutTotals } from '@/src/lib/billing/bookingCheckoutTotals';

const rentPaise = 360_600;
const depositPaise = 360_600;
const discountPaise = 36_060;

const totals = computeNewBookingCheckoutTotals({
  rentSubtotalPaise: rentPaise,
  depositRequiredPaise: depositPaise,
  discountPaise,
});

async function noopUpload(): Promise<string> {
  return 'https://example.com/proof.png';
}

/**
 * Visual QA harness for the production coupon fixture:
 * Rent ₹3,606 − Promo ₹361 + Deposit ₹3,606 = Total ₹6,851
 */
export default function PricingSummaryProofPage() {
  return (
    <div className="min-h-screen bg-[#0b1220] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-apg-cyan">
            Visual QA · post-fix proof
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl">Booking pricing summary fixture</h1>
          <p className="text-sm text-apg-silver">
            Rent ₹3,606 · Promo −₹361 · Deposit ₹3,606 · Total payable ₹6,851
          </p>
        </header>

        <section data-testid="pricing-proof-review" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-muted">
            Booking review
          </h2>
          <BookingReviewCard
            data={{
              pgName: 'Awesome PG · Production fixture',
              roomNumber: '12',
              bedCode: 'A',
              stayType: 'monthly',
              stayTypeLabel: 'Monthly stay',
              checkIn: '2026-07-01',
              rentPaise,
              depositPaise: totals.depositDueNowPaise,
              depositRequiredPaise: depositPaise,
              totalDuePaise: totals.totalToCollectTodayPaise,
            }}
            discountPaise={discountPaise}
            couponCode="WELCOME10"
            couponLabel="10% off rent"
            totalDuePaise={totals.totalToCollectTodayPaise}
          />
        </section>

        <section data-testid="pricing-proof-checkout" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-muted">
            Payment / checkout (compact mobile layout)
          </h2>
          <BookingCheckoutExperience
            bookingCode="APG-PROOF-6851"
            pgName="Awesome PG · Production fixture"
            roomNumber="12"
            bedCode="A"
            isReserveBooking={false}
            durationMode="monthly"
            expectedCheckoutDate={null}
            checkInDate="2026-07-01"
            subtotalPaise={rentPaise}
            depositPaise={depositPaise}
            totalPaise={totals.totalToCollectTodayPaise}
            totalLabel="₹6,851"
            qrImageUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23fff'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%23000' font-size='14'%3EQR%3C/text%3E%3C/svg%3E"
            upiId="proof@upi"
            uploadScreenshot={noopUpload}
            discountPaise={discountPaise}
            couponCode="WELCOME10"
            couponLabel="10% off rent"
            compactLayout
          />
        </section>
      </div>
    </div>
  );
}
