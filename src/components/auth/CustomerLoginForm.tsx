'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  authFieldLabelClassName,
  authInputClassName,
} from '@/src/components/auth/authFieldStyles';
import { IndianPhoneInput } from '@/src/components/customer/IndianPhoneInput';
import { SignupProgress } from '@/src/components/auth/SignupProgress';
import {
  SIGNUP_GENERIC_ERROR_MESSAGE,
  SIGNUP_REQUEST_TIMEOUT_MS,
  SIGNUP_TIMEOUT_MESSAGE,
  SignupRequestTimeoutError,
  signupFetch,
} from '@/src/lib/auth/signupFetch';
import { safeNext } from '@/src/lib/auth/safeNext';
import { INDIAN_MOBILE_LOCAL, formatIndianPhoneDisplay } from '@/src/lib/phone';

type Step = 'credentials' | 'otp' | 'profile' | 'reset-password';
type OtpPurpose = 'signup' | 'forgot_password';
type OtpSubmitPhase = 'idle' | 'verifying' | 'success';
type ProfileSubmitPhase = 'idle' | 'submitting' | 'success' | 'redirecting';

function formatResendWait(seconds: number): string {
  if (seconds >= 3600) {
    const mins = Math.ceil(seconds / 60);
    return `${mins} minute${mins === 1 ? '' : 's'}`;
  }
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins} minute${mins === 1 ? '' : 's'}`;
  }
  return `${seconds}s`;
}

export function CustomerLoginForm({
  theme = 'light',
  signupMode = false,
  initialEmail,
  initialMessage,
}: {
  theme?: 'light' | 'dark';
  /** Only true on /login?signup=1 — otherwise sign-in only. */
  signupMode?: boolean;
  initialEmail?: string;
  initialMessage?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const allowSignupFlow = signupMode;

  const [step, setStep] = useState<Step>('credentials');
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose>('signup');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialMessage ?? null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpPhase, setOtpPhase] = useState<OtpSubmitPhase>('idle');
  const [profilePhase, setProfilePhase] = useState<ProfileSubmitPhase>('idle');
  const verifyInFlight = useRef(false);
  const profileInFlight = useRef(false);

  const phoneDisplay =
    phone.length === 10 ? formatIndianPhoneDisplay(`+91${phone}`) : phone;

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = window.setInterval(() => {
      setResendSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [resendSeconds]);

  useEffect(() => {
    if (otpPhase !== 'verifying') return;
    const watchdog = window.setTimeout(() => {
      verifyInFlight.current = false;
      setOtpPhase('idle');
      setPending(false);
      setError(SIGNUP_TIMEOUT_MESSAGE);
    }, SIGNUP_REQUEST_TIMEOUT_MS + 2_000);
    return () => window.clearTimeout(watchdog);
  }, [otpPhase]);

  useEffect(() => {
    if (profilePhase !== 'submitting') return;
    const watchdog = window.setTimeout(() => {
      setProfilePhase('idle');
      profileInFlight.current = false;
      setPending(false);
      setError(SIGNUP_TIMEOUT_MESSAGE);
    }, SIGNUP_REQUEST_TIMEOUT_MS + 2_000);
    return () => window.clearTimeout(watchdog);
  }, [profilePhase]);

  useEffect(() => {
    if (profilePhase !== 'redirecting') return;
    const redirectUrl = `/account/set-password?next=${encodeURIComponent(next)}`;
    const fallback = window.setTimeout(() => {
      if (!window.location.pathname.startsWith('/account/set-password')) {
        window.location.assign(redirectUrl);
      }
    }, 5_000);
    return () => window.clearTimeout(fallback);
  }, [profilePhase, next]);

  useEffect(() => {
    const forgotOtp = step === 'otp' && otpPurpose === 'forgot_password';
    if (
      !allowSignupFlow &&
      step !== 'credentials' &&
      step !== 'reset-password' &&
      !forgotOtp
    ) {
      setStep('credentials');
      setEmailVerified(false);
      setOtpPhase('idle');
      setProfilePhase('idle');
    }
  }, [allowSignupFlow, step, otpPurpose]);

  const signupAutoSendDone = useRef(false);
  useEffect(() => {
    if (!allowSignupFlow) return;
    const paramEmail = searchParams.get('email')?.trim();
    if (paramEmail) setEmail(paramEmail);
  }, [allowSignupFlow, searchParams]);

  useEffect(() => {
    if (!allowSignupFlow || signupAutoSendDone.current) return;
    const target = (searchParams.get('email') ?? email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return;
    signupAutoSendDone.current = true;
    setEmail(target);
    setOtpPurpose('signup');
    void sendCode('signup');
  }, [allowSignupFlow, searchParams, email]);

  async function resetToLogin(message?: string) {
    try {
      await fetch('/api/auth/customer/signup/reset', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      /* best-effort */
    }
    setStep('credentials');
    setOtpPurpose('signup');
    setCode('');
    setEmailVerified(false);
    setOtpPhase('idle');
    setProfilePhase('idle');
    verifyInFlight.current = false;
    profileInFlight.current = false;
    setPending(false);
    setFullName('');
    setPhone('');
    setNewPassword('');
    setConfirmPassword('');
    if (message) setError(message);
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }

  function resetVerifyState() {
    verifyInFlight.current = false;
    setOtpPhase('idle');
    setPending(false);
  }

  function resetProfileSubmit() {
    setProfilePhase('idle');
    profileInFlight.current = false;
    setPending(false);
  }

  function redirectAfterSignup(path: string) {
    setProfilePhase('redirecting');
    router.replace(path);
    window.setTimeout(() => {
      if (!window.location.pathname.startsWith('/account/set-password') && path.includes('set-password')) {
        window.location.assign(path);
      } else if (!path.includes('set-password') && window.location.pathname === '/login') {
        window.location.assign(path);
      }
    }, 4_000);
  }

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
        needsCompleteSignup?: boolean;
        mustSetPassword?: boolean;
        accountExists?: boolean;
      };
      if (!res.ok || !data.ok) {
        if (data.needsCompleteSignup) {
          setError(
            data.message ??
              'Signup is not finished for this email. Use “Sign up with email code” below if you were registering, or contact support.',
          );
          return;
        }
        if (data.accountExists) {
          setError(data.message ?? 'Incorrect password. Try again or use Forgot password.');
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
    if (resendSeconds > 0) {
      setError(`Please wait ${formatResendWait(resendSeconds)} before requesting another code.`);
      return;
    }
    const previousStep = step;
    const wasVerified = emailVerified;
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
        rateLimited?: boolean;
        needsLogin?: boolean;
        accountExists?: boolean;
      };
      if (!res.ok || !data.ok) {
        if (data.needsLogin || data.accountExists) {
          await resetToLogin(
            data.message ??
              'This email already has an account. Sign in with your password or use Forgot password.',
          );
          return;
        }
        if (data.retryAfterSeconds) {
          setResendSeconds(data.retryAfterSeconds);
        } else if (data.rateLimited) {
          setResendSeconds(3600);
        }
        setError(
          data.message ??
            (data.rateLimited
              ? 'Too many attempts. Please wait before requesting a new code.'
              : 'Could not send code.'),
        );
        if (previousStep === 'otp' || previousStep === 'profile') {
          setStep(previousStep);
          setEmailVerified(wasVerified);
          if (wasVerified) setOtpPhase('success');
        }
        return;
      }
      applyResendAfter(data.resendAfter);
      setOtpPurpose(purpose);
      if (!wasVerified) {
        setOtpPhase('idle');
      }
      if (step !== 'profile') {
        setStep('otp');
      }
    } finally {
      setPending(false);
    }
  }

  function finishProfileSubmit() {
    profileInFlight.current = false;
    setPending(false);
  }

  async function verifyCode(includeProfile = false) {
    if (includeProfile) {
      if (profileInFlight.current || profilePhase !== 'idle') return;
      profileInFlight.current = true;
      setProfilePhase('submitting');
    } else {
      if (verifyInFlight.current || otpPhase !== 'idle') return;
      if (emailVerified) {
        setStep('profile');
        return;
      }
      verifyInFlight.current = true;
      setOtpPhase('verifying');
    }

    setPending(true);
    setError(null);
    try {
      if (otpPurpose === 'forgot_password' && !includeProfile) {
        setStep('reset-password');
        resetVerifyState();
        return;
      }

      const res = await signupFetch('/api/auth/customer/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          next,
          ...(includeProfile ? { fullName, phone } : {}),
          ...(includeProfile || emailVerified ? {} : { code }),
        }),
        timeoutMs: includeProfile ? SIGNUP_REQUEST_TIMEOUT_MS : SIGNUP_REQUEST_TIMEOUT_MS,
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        needsProfile?: boolean;
        emailVerified?: boolean;
        alreadyVerified?: boolean;
        needsProfileComplete?: boolean;
        needsPassword?: boolean;
        mustSetPassword?: boolean;
        legacyIncomplete?: boolean;
        needsNewCode?: boolean;
        needsSignup?: boolean;
        needsLogin?: boolean;
        retryable?: boolean;
        redirect?: string;
      };

      if (data.needsLogin) {
        if (includeProfile) resetProfileSubmit();
        else resetVerifyState();
        await resetToLogin(
          data.message ??
            'This email already has an account. Sign in with your password or use Forgot password.',
        );
        return;
      }

      if (data.needsPassword && !includeProfile) {
        resetVerifyState();
        redirectAfterSignup(`/account/set-password?next=${encodeURIComponent(next)}`);
        return;
      }

      if (data.legacyIncomplete && data.mustSetPassword && !includeProfile) {
        resetVerifyState();
        redirectAfterSignup(`/account/set-password?next=${encodeURIComponent(next)}`);
        return;
      }

      if (data.needsProfile || data.emailVerified) {
        setOtpPhase('success');
        setEmailVerified(true);
        setStep('profile');
        setError(null);
        if (includeProfile) finishProfileSubmit();
        else resetVerifyState();
        return;
      }

      if (data.needsPassword && includeProfile) {
        setProfilePhase('success');
        finishProfileSubmit();
        redirectAfterSignup(`/account/set-password?next=${encodeURIComponent(next)}`);
        return;
      }

      if (!res.ok || !data.ok) {
        if (data.needsProfileComplete && data.redirect) {
          setProfilePhase('redirecting');
          router.replace(data.redirect);
          return;
        }
        if (data.needsNewCode && includeProfile) {
          setStep('otp');
          setEmailVerified(false);
          setOtpPhase('idle');
          setCode('');
          setError(data.message ?? 'Your verification expired. Enter a new code, then try again.');
        } else if (includeProfile) {
          resetProfileSubmit();
          setError(data.message ?? 'Could not save your profile. Try again.');
        } else {
          resetVerifyState();
          setError(data.message ?? 'Verification failed.');
        }
        return;
      }

      if (includeProfile) {
        setProfilePhase('success');
        finishProfileSubmit();
        if (data.mustSetPassword || data.needsPassword) {
          redirectAfterSignup(`/account/set-password?next=${encodeURIComponent(next)}`);
          return;
        }
        setProfilePhase('redirecting');
        router.replace(next);
        router.refresh();
        return;
      }

      if (data.mustSetPassword) {
        resetVerifyState();
        router.replace(`/account/set-password?next=${encodeURIComponent(next)}`);
        return;
      }
      resetVerifyState();
      router.replace(next);
      router.refresh();
    } catch (err) {
      if (includeProfile) {
        resetProfileSubmit();
        setError(
          err instanceof SignupRequestTimeoutError
            ? SIGNUP_TIMEOUT_MESSAGE
            : SIGNUP_GENERIC_ERROR_MESSAGE,
        );
      } else {
        resetVerifyState();
        setError(
          err instanceof SignupRequestTimeoutError
            ? SIGNUP_TIMEOUT_MESSAGE
            : SIGNUP_GENERIC_ERROR_MESSAGE,
        );
      }
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
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        needsCompleteSignup?: boolean;
        useSetPassword?: boolean;
      };
      if (!res.ok || !data.ok) {
        if (data.useSetPassword || data.needsCompleteSignup) {
          const setRes = await signupFetch('/api/auth/customer/set-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email.trim(),
              password: newPassword,
              confirmPassword,
            }),
          });
          const setData = (await setRes.json()) as { ok: boolean; message?: string };
          if (setRes.ok && setData.ok) {
            router.replace(next);
            router.refresh();
            return;
          }
          setError(setData.message ?? 'Could not save password.');
          return;
        }
        setError(data.message ?? 'Could not reset password.');
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function startSignup() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter your email above first, then tap Sign up.');
      return;
    }
    setError(null);
    try {
      const lookup = await fetch(
        `/api/auth/customer/email/lookup?email=${encodeURIComponent(email.trim())}`,
        { credentials: 'same-origin' },
      );
      if (lookup.ok) {
        const info = (await lookup.json()) as { shouldLogin?: boolean; message?: string | null };
        if (info.shouldLogin) {
          await resetToLogin(
            info.message ??
              'This email already has an account. Sign in with your password or use Forgot password.',
          );
          return;
        }
      }
    } catch {
      /* continue */
    }
    const q = new URLSearchParams();
    q.set('signup', '1');
    q.set('next', next);
    q.set('email', email.trim());
    router.push(`/login?${q.toString()}`);
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
  const successClass = dark
    ? 'rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200'
    : 'rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700';
  const infoClass = dark
    ? 'rounded-lg bg-apg-orange/10 px-3 py-2 text-sm text-apg-orange'
    : 'rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-700';

  const otpLocked = otpPhase === 'success' || emailVerified;
  const otpButtonLabel =
    otpPhase === 'verifying'
      ? 'Verifying…'
      : otpPhase === 'success'
        ? 'Email verified ✓'
        : otpPurpose === 'forgot_password'
          ? 'Verify code'
          : 'Verify & continue';
  const profileButtonLabel =
    profilePhase === 'submitting'
      ? 'Saving profile…'
      : profilePhase === 'success'
        ? 'Profile saved ✓'
        : profilePhase === 'redirecting'
          ? 'Redirecting…'
          : 'Continue';
  const profileLocked = profilePhase !== 'idle';

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

      {allowSignupFlow && step === 'otp' && otpPurpose === 'signup' ? (
        <SignupProgress current="otp" theme={theme} />
      ) : null}

      {step === 'otp' && (allowSignupFlow || otpPurpose === 'forgot_password') ? (
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
              disabled={otpLocked || pending}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} font-mono tracking-[0.3em] disabled:opacity-60`}
            />
          </label>
          {otpPhase === 'success' ? (
            <p className={successClass}>Email verified. Continue below to finish signing up.</p>
          ) : null}
          {resendSeconds > 0 ? (
            <p className={infoClass}>
              You can request another code in {formatResendWait(resendSeconds)}.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || otpLocked || otpPhase === 'verifying'}
            className={btnClass}
          >
            {otpButtonLabel}
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
              {resendSeconds > 0
                ? `Resend available in ${formatResendWait(resendSeconds)}`
                : 'Resend code'}
            </button>
          </div>
        </form>
      ) : null}

      {allowSignupFlow && step === 'profile' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifyCode(true);
          }}
          className="space-y-3"
        >
          <SignupProgress current="profile" theme={theme} />
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
              disabled={profileLocked}
              onChange={(e) => setFullName(e.target.value)}
              className={`${inputClass} disabled:opacity-60`}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Mobile number</span>
            <IndianPhoneInput
              value={phone}
              onChange={setPhone}
              required
              autoComplete="tel"
              readOnly={profileLocked}
              className="mt-1"
            />
          </label>
          {phone.length === 10 ? (
            <p className="text-xs text-apg-silver">We&apos;ll reach you at {phoneDisplay}.</p>
          ) : null}
          {profilePhase === 'success' || profilePhase === 'redirecting' ? (
            <p className={successClass}>
              {profilePhase === 'redirecting'
                ? 'Profile saved. Taking you to create your password…'
                : 'Profile saved ✓'}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={
              profileLocked || pending || !INDIAN_MOBILE_LOCAL.test(phone) || !fullName.trim()
            }
            className={btnClass}
          >
            {profileButtonLabel}
          </button>
          {error && step === 'profile' && profilePhase === 'idle' ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                void verifyCode(true);
              }}
              className={btnClass}
            >
              Try again
            </button>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => void resetToLogin()}
              className={linkMuted}
            >
              ← Sign in instead
            </button>
            <button
              type="button"
              onClick={() => {
                void resetToLogin().then(() => startForgotPassword());
              }}
              className={linkAccent}
            >
              Forgot password
            </button>
          </div>
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

      {error && !(emailVerified && step === 'profile' && profilePhase !== 'idle') ? (
        <p className={errorClass}>{error}</p>
      ) : null}
    </div>
  );
}
