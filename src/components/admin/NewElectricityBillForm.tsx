'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createElectricityBillAction,
  type ActionState,
} from '@/app/(admin)/admin/electricity/new/actions';
import type { RoomPickerRow } from '@/src/db/queries/admin';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { paiseToInr } from '@/src/lib/format';
import { ElectricityCheckoutReconciliationPreview } from '@/src/components/admin/electricity/ElectricityCheckoutReconciliationPreview';

const idle: ActionState = { status: 'idle' };
const POLL_INTERVAL_MS = 1_500;

type GenerationPhase = 'idle' | 'generating' | 'completed' | 'failed' | 'duplicate';

export function NewElectricityBillForm({
  rooms,
  defaultMonth,
  defaultRoomId,
  defaultPgId,
  showPgPicker = false,
  wizardMode = false,
  wizardPgId,
  wizardRoomLabel,
  wizardProgress,
}: {
  rooms: RoomPickerRow[];
  defaultMonth: string;
  defaultRoomId?: string;
  defaultPgId?: string;
  showPgPicker?: boolean;
  wizardMode?: boolean;
  wizardPgId?: string;
  wizardRoomLabel?: string;
  wizardProgress?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const requestIdRef = useRef(crypto.randomUUID());

  const pgOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rooms) map.set(r.pgId, r.pgName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rooms]);

  const [pgId, setPgId] = useState<string>(
    defaultPgId ?? (pgOptions.length === 1 ? pgOptions[0][0] : ''),
  );
  const filteredRooms = useMemo(
    () => (pgId ? rooms.filter((r) => r.pgId === pgId) : rooms),
    [rooms, pgId],
  );

  const [state, setState] = useState<ActionState>(idle);
  const [phase, setPhase] = useState<GenerationPhase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [prevReading, setPrevReading] = useState<string>('');
  const [currReading, setCurrReading] = useState<string>('');
  const [rateInr, setRateInr] = useState<string>(
    String(DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE / 100),
  );
  const [roomId, setRoomId] = useState<string>(defaultRoomId ?? '');
  const [billingMonth, setBillingMonth] = useState<string>(defaultMonth);
  const [loadingPrev, setLoadingPrev] = useState(false);

  const effectiveBillingMonth = wizardMode ? defaultMonth : billingMonth;
  const isBusy = phase === 'generating';

  useEffect(() => {
    if (defaultRoomId) setRoomId(defaultRoomId);
  }, [defaultRoomId]);

  useEffect(() => {
    if (defaultRoomId) return;
    if (filteredRooms.some((r) => r.roomId === roomId)) return;
    setRoomId('');
  }, [pgId, filteredRooms, roomId, defaultRoomId]);

  useEffect(() => {
    if (!roomId) return;
    setLoadingPrev(true);
    void fetch(`/api/admin/rooms/${roomId}/last-electricity-reading`, { cache: 'no-store' })
      .then((res) => res.json())
      .then(
        (json: {
          ok?: boolean;
          data?: { previousReadingUnits: number; ratePerUnitPaise: number };
        }) => {
          if (json.ok && json.data) {
            setPrevReading(String(json.data.previousReadingUnits));
            setRateInr(String(json.data.ratePerUnitPaise / 100));
          }
        },
      )
      .catch(() => undefined)
      .finally(() => setLoadingPrev(false));
  }, [roomId]);

  const pollJobUntilDone = useCallback(
    async (pollJobId: string): Promise<ActionState | null> => {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const res = await fetch(`/api/admin/electricity-bill-jobs/${pollJobId}`, {
          cache: 'no-store',
        });
        const json = (await res.json()) as {
          ok?: boolean;
          job?: {
            status: string;
            billId: string | null;
            errorMessage: string | null;
          };
        };
        if (!json.ok || !json.job) return null;

        if (json.job.status === 'success' && json.job.billId) {
          return {
            status: 'success',
            billId: json.job.billId,
            redirectTo: `/admin/electricity/bills/${json.job.billId}`,
            jobId: pollJobId,
          };
        }
        if (json.job.status === 'duplicate' && json.job.billId) {
          return {
            status: 'duplicate',
            existingBillId: json.job.billId,
            jobId: pollJobId,
          };
        }
        if (json.job.status === 'failed') {
          return {
            status: 'error',
            message: json.job.errorMessage ?? 'Bill generation failed.',
            jobId: pollJobId,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      return {
        status: 'error',
        message:
          'Generation is still running. Refresh this page — do not submit again until status shows completed or failed.',
        jobId: pollJobId,
      };
    },
    [],
  );

  useEffect(() => {
    if (!roomId || !effectiveBillingMonth || phase !== 'idle') return;
    void fetch(
      `/api/admin/electricity-bill-jobs/active?roomId=${roomId}&billingMonth=${effectiveBillingMonth}`,
      { cache: 'no-store' },
    )
      .then((res) => res.json())
      .then(async (json: { ok?: boolean; job?: { id: string; status: string } | null }) => {
        if (!json.ok || !json.job || json.job.status !== 'running') return;
        setPhase('generating');
        setJobId(json.job.id);
        const result = await pollJobUntilDone(json.job.id);
        if (!result) return;
        setState(result);
        if (result.status === 'success') {
          setPhase('completed');
          router.push(result.redirectTo);
        } else if (result.status === 'duplicate') {
          setPhase('duplicate');
        } else {
          setPhase('failed');
        }
      })
      .catch(() => undefined);
  }, [effectiveBillingMonth, phase, pollJobUntilDone, roomId, router]);

  const selectedRoom = useMemo(
    () => filteredRooms.find((r) => r.roomId === roomId),
    [filteredRooms, roomId],
  );

  const previewUnits = useMemo(() => {
    const p = Number(prevReading);
    const c = Number(currReading);
    if (!Number.isFinite(p) || !Number.isFinite(c)) return null;
    if (c < p) return null;
    return Math.round((c - p) * 100) / 100;
  }, [prevReading, currReading]);

  const previewTotalPaise = useMemo(() => {
    if (previewUnits == null) return null;
    const r = Number(rateInr);
    if (!Number.isFinite(r)) return null;
    return Math.round(previewUnits * r * 100);
  }, [previewUnits, rateInr]);

  const readingsInverted = useMemo(() => {
    const p = Number(prevReading);
    const c = Number(currReading);
    return (
      prevReading !== '' &&
      currReading !== '' &&
      Number.isFinite(p) &&
      Number.isFinite(c) &&
      c < p
    );
  }, [prevReading, currReading]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isBusy) return;

      setPhase('generating');
      setState(idle);
      setJobId(null);

      try {
        const formData = new FormData(event.currentTarget);
        formData.set('requestId', requestIdRef.current);
        const result = await createElectricityBillAction(idle, formData);

        if (result.status === 'processing') {
          setJobId(result.jobId);
          const polled = await pollJobUntilDone(result.jobId);
          if (!polled) {
            setPhase('failed');
            setState({
              status: 'error',
              message: 'Could not read generation job status.',
              jobId: result.jobId,
            });
            return;
          }
          setState(polled);
          if (polled.status === 'success') {
            setPhase('completed');
            router.push(polled.redirectTo);
            return;
          }
          if (polled.status === 'duplicate') {
            setPhase('duplicate');
            return;
          }
          setPhase('failed');
          return;
        }

        setState(result);
        if (result.status === 'success') {
          setPhase('completed');
          if ('jobId' in result) setJobId(result.jobId);
          router.push(result.redirectTo);
          return;
        }
        if (result.status === 'duplicate') {
          setPhase('duplicate');
          if ('jobId' in result) setJobId(result.jobId ?? null);
          return;
        }
        setPhase('failed');
        if (result.status === 'error' && result.jobId) setJobId(result.jobId);
      } catch (err) {
        setPhase('failed');
        setState({
          status: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Something went wrong while creating the bill.',
        });
      }
    },
    [isBusy, pollJobUntilDone, router],
  );

  const handleRetry = useCallback(() => {
    requestIdRef.current = crypto.randomUUID();
    setPhase('idle');
    setState(idle);
    setJobId(null);
    formRef.current?.requestSubmit();
  }, []);

  const buttonLabel =
    phase === 'generating'
      ? 'Generating…'
      : phase === 'completed'
        ? 'Completed'
        : wizardMode
          ? 'Generate & Next →'
          : 'Generate electricity bills for room';

  return (
    <form
      ref={formRef}
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-xl border border-white/10 bg-[#1A1F27] p-5"
    >
      {wizardMode && wizardRoomLabel ? (
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#FF5A1F]">
            {wizardProgress ?? 'Electricity wizard'}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">Room {wizardRoomLabel}</h2>
          <p className="mt-1 text-xs text-apg-silver">
            Previous reading is auto-filled. Enter current reading only.
          </p>
        </header>
      ) : null}

      {phase === 'generating' ? (
        <p className="rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
          Generating bill{jobId ? ` (job ${jobId.slice(0, 8)}…)` : ''} — please wait. Do not
          submit again.
        </p>
      ) : null}

      {wizardMode ? (
        <>
          <input type="hidden" name="wizardMode" value="1" />
          <input type="hidden" name="wizardPgId" value={wizardPgId ?? pgId} />
          <input type="hidden" name="roomId" value={roomId} />
        </>
      ) : null}

      {!wizardMode && showPgPicker && pgOptions.length > 1 ? (
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">PG</span>
          <select
            required
            value={pgId}
            onChange={(e) => setPgId(e.target.value)}
            disabled={isBusy}
            className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
          >
            <option value="">— pick a PG —</option>
            {pgOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!wizardMode ? (
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
          Room
        </span>
        <select
          name="roomId"
          required
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          disabled={isBusy}
          className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        >
          <option value="">— pick a room —</option>
          {filteredRooms.map((r) => (
            <option key={r.roomId} value={r.roomId}>
              {r.pgName} · Room {r.roomNumber} ({r.bedCount} bed{r.bedCount === 1 ? '' : 's'})
              {r.prepaidCreditPaise > 0 ? ` · ${paiseToInr(r.prepaidCreditPaise)} prepaid` : ''}
            </option>
          ))}
        </select>
      </label>
      ) : null}

      {!wizardMode ? (
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
          Billing month (YYYY-MM-01)
        </span>
        <input
          type="text"
          name="billingMonth"
          required
          value={billingMonth}
          onChange={(e) => setBillingMonth(e.target.value)}
          disabled={isBusy}
          pattern="\d{4}-\d{2}-\d{2}"
          className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        />
      </label>
      ) : (
        <input type="hidden" name="billingMonth" value={defaultMonth} />
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
            Previous reading (units)
          </span>
          <div className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D]/60 px-3 py-2 text-sm text-apg-silver">
            {prevReading || (loadingPrev ? '…' : '—')}
          </div>
          <input type="hidden" name="previousReadingUnits" value={prevReading} required />
          {loadingPrev ? (
            <p className="mt-1 text-[11px] text-apg-silver">Loading last reading…</p>
          ) : roomId ? (
            <p className="mt-1 text-[11px] text-apg-silver">
              Locked to last finalized monthly reading for this room (move-out settlements do not
              change it).
            </p>
          ) : null}
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
            Current reading (units)
          </span>
          <input
            type="number"
            name="currentReadingUnits"
            min="0"
            step="0.01"
            required
            value={currReading}
            onChange={(e) => setCurrReading(e.target.value)}
            disabled={isBusy}
            className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      {!wizardMode ? (
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
          Rate per unit (₹) — default ₹16
        </span>
        <input
          type="number"
          name="ratePerUnitInr"
          min="0"
          step="0.01"
          required
          value={rateInr}
          onChange={(e) => setRateInr(e.target.value)}
          disabled={isBusy}
          className="apg-admin-field mt-1 block w-full max-w-xs rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        />
      </label>
      ) : (
        <input type="hidden" name="ratePerUnitInr" value={rateInr} />
      )}

      {readingsInverted ? (
        <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          Current reading must be ≥ previous reading.
        </p>
      ) : previewUnits != null && previewTotalPaise != null ? (
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-apg-silver">
          <div>
            Units consumed: <strong className="text-white">{previewUnits.toFixed(2)}</strong>
          </div>
          <div>
            Bill total: <strong className="text-white">{paiseToInr(previewTotalPaise)}</strong>
            {selectedRoom && selectedRoom.prepaidCreditPaise > 0 ? (
              <>
                {' '}
                − prepaid{' '}
                <strong className="text-white">
                  {paiseToInr(Math.min(selectedRoom.prepaidCreditPaise, previewTotalPaise))}
                </strong>{' '}
                = split{' '}
                <strong className="text-white">
                  {paiseToInr(Math.max(0, previewTotalPaise - selectedRoom.prepaidCreditPaise))}
                </strong>
              </>
            ) : null}{' '}
            — split across monthly residents in this room.
          </div>
          {roomId ? (
            <ElectricityCheckoutReconciliationPreview
              roomId={roomId}
              billingMonth={wizardMode ? defaultMonth : billingMonth}
              grossBillPaise={previewTotalPaise}
            />
          ) : null}
        </div>
      ) : null}

      {!wizardMode ? (
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-apg-silver">
          Notes (optional)
        </span>
        <textarea
          name="notes"
          rows={2}
          disabled={isBusy}
          className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        />
      </label>
      ) : null}

      <button
        type="submit"
        disabled={isBusy || phase === 'completed'}
        className="inline-flex w-full items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        {buttonLabel}
      </button>

      {state.status === 'error' ? (
        <div className="space-y-2">
          <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {state.message}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isBusy}
            className="inline-flex rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
          >
            Try again with new request
          </button>
        </div>
      ) : state.status === 'duplicate' ? (
        <div className="space-y-2">
          <p className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            A bill for this room + month already exists.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/admin/electricity/bills/${state.existingBillId}`)}
            className="inline-flex rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/10"
          >
            View existing bill
          </button>
        </div>
      ) : state.status === 'success' ? (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          Bill created — opening details…
        </p>
      ) : null}

      {phase === 'failed' ? (
        <p className="text-xs text-apg-silver">
          Status: <span className="font-medium text-rose-200">Failed</span>
          {jobId ? ` · job ${jobId}` : ''}
        </p>
      ) : null}
    </form>
  );
}
