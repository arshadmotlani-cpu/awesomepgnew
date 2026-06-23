'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IndianPhoneInput } from '@/src/components/customer/IndianPhoneInput';
import {
  authFieldLabelClassName,
  authInputClassName,
} from '@/src/components/auth/authFieldStyles';
import {
  SIGNUP_GENERIC_ERROR_MESSAGE,
  SIGNUP_REQUEST_TIMEOUT_MS,
  SIGNUP_TIMEOUT_MESSAGE,
  signupFetch,
} from '@/src/lib/auth/signupFetch';
import { INDIAN_MOBILE_LOCAL } from '@/src/lib/phone';

type Phase = 'details' | 'otp' | 'done';

function formatResendWait(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
  }
  return `${seconds}s`;
}

export function BookingInlineAuth({
  onAuthenticated,
  theme = 'dark',
}: {
  onAuthenticated?: () => void;
  theme?: 'light' | 'dark';
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('details');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const verifyInFlight = useRef(false);

  const labelClass = authFieldLabelClassName;
  const inputClass = authInputClassName;

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = window.setInterval(() => setResendSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendSeconds]);

  async function sendOtp() {
    setError(null);
    if (!INDIAN_MOBILE_LOCAL.test(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (fullName.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    setPending(true);
    try {
      const res = await signupFetch('/api/auth/customer/booking/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, fullName: fullName.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        otpHint?: string;
        resendAfter?: number;
      };
      if (!res.ok || !data.ok) {
        setError(data.message ?? SIGNUP_GENERIC_ERROR_MESSAGE);
        return;
      }
      setOtpHint(data.otpHint ?? 'We sent a verification code.');
      setResendSeconds(data.resendAfter ?? 60);
      setPhase('otp');
    } catch {
      setError(SIGNUP_GENERIC_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (verifyInFlight.current || pending) return;
    verifyInFlight.current = true;
    setError(null);
    setPending(true);

    const watchdog = window.setTimeout(() => {
      verifyInFlight.current = false;
      setPending(false);
      setError(SIGNUP_TIMEOUT_MESSAGE);
    }, SIGNUP_REQUEST_TIMEOUT_MS + 2_000);

    try {
      const res = await signupFetch('/api/auth/customer/booking/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          fullName: fullName.trim(),
          code: code.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? SIGNUP_GENERIC_ERROR_MESSAGE);
        return;
      }
      setPhase('done');
      onAuthenticated?.();
      router.refresh();
    } catch {
      setError(SIGNUP_GENERIC_ERROR_MESSAGE);
    } finally {
      window.clearTimeout(watchdog);
      verifyInFlight.current = false;
      setPending(false);
    }
  }

  if (phase === 'done') {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        You&apos;re signed in — continue below.
      </div>
    );
  }

  return (
    <section
      className="rounded-xl border border-white/10 apg-glass-light p-4"
      aria-label="Sign in to book"
    >
      <h2 className="text-sm font-semibold text-white">Almost there — confirm it&apos;s you</h2>
      <p className="mt-1 text-xs text-apg-silver">
        Name, mobile, and a one-time code. No redirect to account settings.
      </p>

      {phase === 'details' ? (
        <div className="mt-4 space-y-3">
          <label className={labelClass}>
            Full name
            <input
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              required
            />
          </label>
          <label className={labelClass}>
            Mobile
            <IndianPhoneInput value={phone} onChange={setPhone} required />
          </label>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => void sendOtp()}
            className="w-full rounded-xl bg-apg-orange py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            {pending ? 'Sending code…' : 'Send verification code'}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void verifyOtp(e)} className="mt-4 space-y-3">
          {otpHint ? <p className="text-xs text-apg-silver">{otpHint}</p> : null}
          <label className={labelClass}>
            Verification code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputClass}
              required
            />
          </label>
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={pending || code.trim().length < 4}
            className="w-full rounded-xl bg-apg-orange py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            {pending ? 'Verifying…' : 'Verify & continue'}
          </button>
          <button
            type="button"
            disabled={pending || resendSeconds > 0}
            onClick={() => void sendOtp()}
            className="w-full text-xs font-medium text-apg-cyan hover:underline disabled:opacity-40"
          >
            {resendSeconds > 0
              ? `Resend code in ${formatResendWait(resendSeconds)}`
              : 'Resend code'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase('details');
              setCode('');
              setError(null);
            }}
            className="w-full text-xs text-apg-silver hover:text-white"
          >
            ← Change name or mobile
          </button>
        </form>
      )}
    </section>
  );
}
