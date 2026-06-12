import type { RoomActivityStats } from '@/src/services/roomActivity';
import { paiseToInr } from '@/src/lib/format';
import { sharingLabelForDisplay } from '@/src/lib/roomDisplay';

type RoomRates = {
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  monthlyDepositPaise: number;
};

type Props = {
  roomType: string;
  capacity: number;
  hasAc: boolean;
  hasAttachedBath: boolean;
  floorLabel: string;
  roomNumber: string;
  rates: RoomRates;
  activity: RoomActivityStats;
};

function sharingLabel(capacity: number, roomType: string): string {
  return sharingLabelForDisplay(capacity, roomType);
}

export function RoomDetailInsights({
  roomType,
  capacity,
  hasAc,
  hasAttachedBath,
  floorLabel,
  roomNumber,
  rates,
  activity,
}: Props) {
  const activityLines: string[] = [];

  if (activity.uniqueViewers7d != null && activity.uniqueViewers7d > 0) {
    activityLines.push(
      `Viewed by ${activity.uniqueViewers7d} ${activity.uniqueViewers7d === 1 ? 'person' : 'people'} in the last 7 days`,
    );
  }

  if (activity.activeCheckoutHolds > 0) {
    activityLines.push(
      `${activity.activeCheckoutHolds} checkout${activity.activeCheckoutHolds === 1 ? '' : 's'} in progress — someone is reserving a bed here right now`,
    );
  }

  if (activity.pendingPayments > 0) {
    activityLines.push(
      `${activity.pendingPayments} booking${activity.pendingPayments === 1 ? '' : 's'} awaiting payment for this room`,
    );
  }

  if (activity.bedsLeavingSoon > 0) {
    activityLines.push(
      `${activity.bedsLeavingSoon} bed${activity.bedsLeavingSoon === 1 ? '' : 's'} opening soon — current guest gave move-out notice`,
    );
  }

  if (activity.bedsOccupiedNow > 0 && activity.bedsAvailableNow === 0 && activityLines.length === 0) {
    activityLines.push(
      `All ${activity.bedsTotal} beds are occupied today — check “Leaving Soon” beds below for upcoming dates`,
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 apg-glass-light p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-apg-orange">
        About this room
      </h2>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InsightItem label="Room" value={`${floorLabel} · Room ${roomNumber}`} />
        <InsightItem label="Sharing" value={sharingLabel(capacity, roomType)} />
        <InsightItem
          label="Setup"
          value={`${capacity} bed${capacity === 1 ? '' : 's'} · ${hasAc ? 'AC' : 'Non-AC'} · ${hasAttachedBath ? 'Attached bath' : 'Shared bath'}`}
        />
        <InsightItem
          label="Availability today"
          value={`${activity.bedsAvailableNow} free · ${activity.bedsOccupiedNow} occupied · ${activity.bedsTotal} total`}
        />
        {rates.monthlyRatePaise > 0 ? (
          <InsightItem label="Rent from" value={`${paiseToInr(rates.monthlyRatePaise)} / month per bed`} />
        ) : null}
        {rates.monthlyDepositPaise > 0 ? (
          <InsightItem
            label="Deposit"
            value={`${paiseToInr(rates.monthlyDepositPaise)} refundable deposit per bed`}
          />
        ) : null}
        {rates.weeklyRatePaise > 0 ? (
          <InsightItem label="Weekly stay" value={`${paiseToInr(rates.weeklyRatePaise)} / week`} />
        ) : null}
        {rates.dailyRatePaise > 0 ? (
          <InsightItem label="Daily stay" value={`${paiseToInr(rates.dailyRatePaise)} / day`} />
        ) : null}
      </dl>

      {activityLines.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">
            Live activity
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-50/90">
            {activityLines.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-amber-300" aria-hidden>
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-amber-200/60">
            Counts come from real bookings, holds, and page visits — not estimates.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-apg-muted">
          No checkout holds or recent browsing activity yet — numbers appear here as people view and
          book this room.
        </p>
      )}
    </section>
  );
}

function InsightItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-apg-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}
