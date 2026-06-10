'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  authFieldLabelClassName,
  authInputClassName,
} from '@/src/components/auth/authFieldStyles';
import { IndianPhoneInput } from '@/src/components/customer/IndianPhoneInput';
import { safeNext } from '@/src/lib/auth/safeNext';
import { INDIAN_MOBILE_LOCAL, formatIndianPhoneDisplay } from '@/src/lib/phone';

type Step = 'email' | 'otp' | 'profile';

export function CustomerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);

  const phoneDisplay =
    phone.length === 10 ? formatIndianPhoneDisplay(`+91${phone}`) : phone;

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = window.setInterval(() => {
      setResendSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [resendSeconds]);

  function applyResendAfter(iso: string | undefined) {
    if (!iso) return;
    const wait = Math.ceil((new Date(iso).getTime() - Date.now()) / 1000);
    if (wait > 0) setResendSeconds(wait);
  }

  async function sendCode() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/customer/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        resendAfter?: string;
        retryAfterSeconds?: number;
      };
      if (!res.ok || !data.ok) {
        if (data.retryAfterSeconds) {
          setResendSeconds(data.retryAfterSeconds);
        }
        setError(data.message ?? 'Could not send code.');
        return;
      }
      applyResendAfter(data.resendAfter);
      setStep('otp');
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(includeProfile = false) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/customer/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code,
          next,
          ...(includeProfile ? { fullName, phone } : {}),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        needsProfile?: boolean;
        needsProfileComplete?: boolean;
        redirect?: string;
      };
      if (!res.ok || !data.ok) {
        if (data.needsProfileComplete && data.redirect) {
          router.replace(data.redirect);
          return;
        }
        if (data.needsProfile) {
          setStep('profile');
          setError(data.message ?? 'Complete your profile.');
          return;
        }
        setError(data.message ?? 'Verification failed.');
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-sm scheme-light">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Sign in with email</h1>
        <p className="mt-1 text-sm text-zinc-500">
          We&apos;ll send a one-time code to your email. Booking and your resident
          account require login.
        </p>
      </div>

      {step === 'email' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
          className="space-y-3"
        >
          <label className="block">
            <span className={authFieldLabelClassName}>Email address</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={authInputClassName}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300"
          >
            {pending ? 'Sending…' : 'Send verification code'}
          </button>
        </form>
      ) : null}

      {step === 'otp' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifyCode(false);
          }}
          className="space-y-3"
        >
          <p className="text-sm text-zinc-600">
            Code sent to <strong>{email.trim()}</strong>. It expires in 5 minutes.
          </p>
          <label className="block">
            <span className={authFieldLabelClassName}>6-digit code</span>
            <input
              type="text"
              name="one-time-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${authInputClassName} font-mono tracking-[0.3em]`}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300"
          >
            {pending ? 'Verifying…' : 'Verify & sign in'}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep('email')}
              className="text-xs text-zinc-500 hover:text-zinc-800"
            >
              ← Use a different email
            </button>
            <button
              type="button"
              disabled={pending || resendSeconds > 0}
              onClick={() => void sendCode()}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:text-zinc-400"
            >
              {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
            </button>
          </div>
        </form>
      ) : null}

      {step === 'profile' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifyCode(true);
          }}
          className="space-y-3"
        >
          <p className="text-sm text-zinc-600">
            First time here with <strong>{email.trim()}</strong>. Tell us a bit about you.
          </p>
          <label className="block">
            <span className={authFieldLabelClassName}>Full name</span>
            <input
              name="fullName"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={authInputClassName}
            />
          </label>
          <label className="block">
            <span className={authFieldLabelClassName}>Mobile number</span>
            <IndianPhoneInput
              value={phone}
              onChange={setPhone}
              required
              autoComplete="tel"
              className="mt-1"
            />
          </label>
          {phone.length === 10 ? (
            <p className="text-xs text-zinc-500">We&apos;ll reach you at {phoneDisplay}.</p>
          ) : null}
          <button
            type="submit"
            disabled={pending || !INDIAN_MOBILE_LOCAL.test(phone)}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300"
          >
            {pending ? 'Creating account…' : 'Continue'}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
