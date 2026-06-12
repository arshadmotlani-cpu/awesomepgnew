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

type Step = 'credentials' | 'otp' | 'profile' | 'reset-password';
type OtpPurpose = 'signup' | 'forgot_password';

export function CustomerLoginForm({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [step, setStep] = useState<Step>('credentials');
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  async function signInWithPassword() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        needsPasswordSetup?: boolean;
        mustSetPassword?: boolean;
      };
      if (!res.ok || !data.ok) {
        if (data.needsPasswordSetup) {
          setOtpPurpose('signup');
          setError('Verify your email with a one-time code to set a password.');
          await sendCode('signup');
          return;
        }
        setError(data.message ?? 'Sign in failed.');
        return;
      }
      if (data.mustSetPassword) {
        router.replace(`/account/set-password?next=${encodeURIComponent(next)}`);
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function sendCode(purpose: OtpPurpose = otpPurpose) {
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
        body: JSON.stringify({ email: email.trim(), purpose }),
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
      setOtpPurpose(purpose);
      setStep('otp');
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(includeProfile = false) {
    setPending(true);
    setError(null);
    try {
      if (otpPurpose === 'forgot_password') {
        setStep('reset-password');
        return;
      }

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
        mustSetPassword?: boolean;
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
      if (data.mustSetPassword) {
        router.replace(`/account/set-password?next=${encodeURIComponent(next)}`);
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function completeForgotPassword() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/customer/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code,
          password: newPassword,
          confirmPassword,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Could not reset password.');
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function startSignup() {
    setError(null);
    setPassword('');
    setCode('');
    setOtpPurpose('signup');
    void sendCode('signup');
  }

  function startForgotPassword() {
    setError(null);
    setPassword('');
    setCode('');
    setOtpPurpose('forgot_password');
    if (!email.trim()) {
      setError('Enter your email above, then tap forgot password.');
      return;
    }
    void sendCode('forgot_password');
  }

  const dark = theme === 'dark';
  const shell = dark
    ? 'space-y-4 text-[#f4f6f8]'
    : 'mx-auto w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-sm scheme-light';
  const titleClass = dark ? 'text-lg font-semibold text-white' : 'text-xl font-semibold text-zinc-900';
  const subClass = dark ? 'mt-1 text-sm text-apg-silver' : 'mt-1 text-sm text-zinc-500';
  const inputClass = dark
    ? 'apg-field-input apg-input-dark mt-1 block w-full rounded-lg px-3 py-2.5 text-base'
    : authInputClassName;
  const labelClass = dark
    ? 'text-xs font-medium uppercase tracking-wide text-apg-silver'
    : authFieldLabelClassName;
  const btnClass = dark
    ? 'w-full rounded-lg bg-apg-orange px-4 py-2.5 text-sm font-semibold text-white apg-glow-btn hover:brightness-110 disabled:opacity-50'
    : 'w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300';
  const mutedText = dark ? 'text-sm text-apg-silver' : 'text-sm text-zinc-600';
  const linkMuted = dark ? 'text-xs text-apg-silver hover:text-white' : 'text-xs text-zinc-500 hover:text-zinc-800';
  const linkAccent = dark
    ? 'text-xs font-medium text-apg-orange hover:brightness-110 disabled:text-apg-muted'
    : 'text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:text-zinc-400';
  const errorClass = dark
    ? 'rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200'
    : 'rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700';

  return (
    <div className={shell}>
      {!dark && step === 'credentials' ? (
        <div>
          <h1 className={titleClass}>Sign in</h1>
          <p className={subClass}>
            Use your email and password. We only send a verification code when you sign up or forget
            your password.
          </p>
        </div>
      ) : null}

      {step === 'credentials' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signInWithPassword();
          }}
          className="space-y-3"
        >
          <label className="block">
            <span className={labelClass}>Email address</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          <button type="submit" disabled={pending} className={btnClass}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={startForgotPassword} className={linkAccent}>
              Forgot password?
            </button>
            <button type="button" onClick={startSignup} className={linkAccent}>
              New here? Sign up with email code
            </button>
          </div>
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
          <p className={mutedText}>
            {otpPurpose === 'forgot_password'
              ? 'Enter the code we sent to reset your password for '
              : 'Code sent to '}
            <strong className={dark ? 'text-white' : 'text-zinc-900'}>{email.trim()}</strong>.
            {otpPurpose === 'signup' ? ' It expires in 5 minutes.' : null}
          </p>
          <label className="block">
            <span className={labelClass}>6-digit code</span>
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
              className={`${inputClass} font-mono tracking-[0.3em]`}
            />
          </label>
          <button type="submit" disabled={pending} className={btnClass}>
            {pending
              ? 'Verifying…'
              : otpPurpose === 'forgot_password'
                ? 'Verify code'
                : 'Verify & continue'}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setCode('');
                setError(null);
              }}
              className={linkMuted}
            >
              ← Back to sign in
            </button>
            <button
              type="button"
              disabled={pending || resendSeconds > 0}
              onClick={() => void sendCode(otpPurpose)}
              className={linkAccent}
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
          <p className={mutedText}>
            First time here with{' '}
            <strong className={dark ? 'text-white' : 'text-zinc-900'}>{email.trim()}</strong>. Tell
            us a bit about you, then you&apos;ll choose a password.
          </p>
          <label className="block">
            <span className={labelClass}>Full name</span>
            <input
              name="fullName"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Mobile number</span>
            <IndianPhoneInput
              value={phone}
              onChange={setPhone}
              required
              autoComplete="tel"
              className="mt-1"
            />
          </label>
          {phone.length === 10 ? (
            <p className="text-xs text-apg-silver">We&apos;ll reach you at {phoneDisplay}.</p>
          ) : null}
          <button
            type="submit"
            disabled={pending || !INDIAN_MOBILE_LOCAL.test(phone)}
            className={btnClass}
          >
            {pending ? 'Creating account…' : 'Continue'}
          </button>
        </form>
      ) : null}

      {step === 'reset-password' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void completeForgotPassword();
          }}
          className="space-y-3"
        >
          <p className={mutedText}>
            Choose a new password for{' '}
            <strong className={dark ? 'text-white' : 'text-zinc-900'}>{email.trim()}</strong>.
          </p>
          <label className="block">
            <span className={labelClass}>New password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
            <span className={`mt-1 block text-[11px] ${dark ? 'text-apg-silver' : 'text-zinc-500'}`}>
              At least 8 characters.
            </span>
          </label>
          <label className="block">
            <span className={labelClass}>Confirm password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          <button type="submit" disabled={pending} className={btnClass}>
            {pending ? 'Saving…' : 'Save password & sign in'}
          </button>
          <button
            type="button"
            onClick={() => setStep('otp')}
            className={linkMuted}
          >
            ← Back to code
          </button>
        </form>
      ) : null}

      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
