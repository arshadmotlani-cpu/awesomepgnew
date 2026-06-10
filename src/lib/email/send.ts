import { env } from '@/src/lib/env';

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { ok: true; provider: 'resend' | 'smtp' | 'log'; messageId?: string }
  | { ok: false; message: string; providerError?: string };

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, message: 'Resend is not configured.' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html ?? undefined,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[email] Resend failed (${res.status}):`, body.slice(0, 500));
      return {
        ok: false,
        message: 'Could not send email. Try again shortly.',
        providerError: body,
      };
    }
    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(body) as { id?: string };
      messageId = parsed.id;
      console.log(`[email] Resend accepted: id=${messageId} to=${input.to}`);
    } catch {
      console.log(`[email] Resend accepted (${res.status}) to=${input.to}`);
    }
    return { ok: true, provider: 'resend', messageId };
  } catch (err) {
    console.error('[email] Resend network error:', err);
    return { ok: false, message: 'Could not send email. Try again shortly.' };
  }
}

async function sendViaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const from = env.EMAIL_FROM;
  if (!host || !from) {
    return { ok: false, message: 'SMTP is not configured.' };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    const info = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true, provider: 'smtp', messageId: info.messageId };
  } catch (err) {
    console.error('[email] SMTP error:', err);
    return { ok: false, message: 'Could not send email. Try again shortly.' };
  }
}

function logEmail(input: SendEmailInput): SendEmailResult {
  console.log('[email] (dev log)', {
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
  return { ok: true, provider: 'log' };
}

/**
 * Send transactional email via Resend (preferred), SMTP fallback, or console
 * log in development when no real provider is configured.
 *
 * When RESEND_API_KEY or SMTP is configured, delivery failures are surfaced
 * to the caller — we do not silently fall back to console logging.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const resendConfigured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  const smtpConfigured = Boolean(env.SMTP_HOST && env.EMAIL_FROM);

  if (resendConfigured) {
    const result = await sendViaResend(input);
    if (result.ok) return result;
    return result;
  }

  if (smtpConfigured) {
    const result = await sendViaSmtp(input);
    if (result.ok) return result;
    return result;
  }

  if (env.NODE_ENV !== 'production') {
    console.warn(
      '[email] No provider configured — OTP logged to console only (development).',
    );
    return logEmail(input);
  }

  console.error('[email] No email provider configured (set RESEND_API_KEY or SMTP_HOST).');
  return { ok: false, message: 'Email is not available right now. Please try again later.' };
}

/** Fire-and-forget helper for notification hooks. */
export function queueEmail(input: SendEmailInput): void {
  void sendEmail(input).catch((err) => {
    console.error('[email] queue failed:', err);
  });
}
