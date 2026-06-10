/**
 * Payment provider abstraction.
 *
 * The booking-lifecycle code (src/services/bookingLifecycle.ts) talks to a
 * single {@link PaymentProvider} interface; the concrete implementation is
 * chosen at runtime via the `PAYMENT_PROVIDER` env var:
 *
 *   - `mock`     (default) — no external network. The pay page renders a
 *                "Simulate payment" button that posts to /api/webhooks/mock,
 *                which calls back into the SAME lifecycle code as Razorpay.
 *                Used in dev + CI so the test suite never needs a Razorpay
 *                account.
 *   - `razorpay` — real Razorpay Orders + Webhooks. Signature verification
 *                uses HMAC-SHA256 with RAZORPAY_WEBHOOK_SECRET, matching
 *                https://razorpay.com/docs/webhooks/validate-test/.
 *
 * The interface is intentionally narrow — we only need order creation,
 * webhook verification, and refunds. Anything Razorpay-specific (key id,
 * checkout SDK URL) is exposed via dedicated, provider-tagged helpers.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../lib/env';

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type ProviderName = 'mock' | 'razorpay';

export type ProviderOrder = {
  provider: ProviderName;
  /** External order id ("order_xxx" for Razorpay; "mock_order_xxx" for mock). */
  providerOrderId: string;
  amountPaise: number;
  currency: 'INR';
  /** Internal booking reference echoed back through the webhook. */
  receipt: string;
};

export type WebhookVerification =
  | { ok: true; event: ParsedWebhookEvent }
  | { ok: false; reason: string };

/**
 * Phase 5 + 5.5 — routing tag that lets a single webhook endpoint
 * dispatch to the right lifecycle handler. Carried in `payment.notes.kind`
 * (Razorpay) or the top-level `purpose` field (mock body). Defaults to
 * `'booking'` when the note is absent (so pre-Phase-5 payments still work).
 *
 * Required side-keys:
 *   - `extension`   → `extensionId`
 *   - `rent`        → `rentInvoiceId`
 *   - `electricity` → `electricityInvoiceId`
 */
export type PaymentPurposeTag =
  | { purpose: 'booking' }
  | { purpose: 'extension'; extensionId: string }
  | { purpose: 'rent'; rentInvoiceId: string }
  | { purpose: 'electricity'; electricityInvoiceId: string };

export type ParsedWebhookEvent =
  | ({
      kind: 'payment_succeeded';
      providerPaymentId: string;
      providerOrderId: string | null;
      amountPaise: number;
      currency: string;
      receipt: string | null;
      raw: unknown;
    } & PaymentPurposeTag)
  | ({
      kind: 'payment_failed';
      providerPaymentId: string;
      providerOrderId: string | null;
      /** Booking code from `payment.notes.booking_code` (or webhook `receipt`). */
      receipt: string | null;
      reason: string;
      raw: unknown;
    } & PaymentPurposeTag)
  | {
      kind: 'refund_succeeded';
      providerPaymentId: string;
      providerRefundId: string;
      amountPaise: number;
      raw: unknown;
    };

export type RefundResult = {
  providerRefundId: string;
  amountPaise: number;
  status: 'succeeded' | 'pending';
};

export interface PaymentProvider {
  readonly name: ProviderName;
  /** Build an order the client SDK can open. */
  createOrder(input: {
    bookingId: string;
    bookingCode: string;
    amountPaise: number;
    notes?: Record<string, string>;
  }): Promise<ProviderOrder>;

  /** Verify a webhook request signature + parse the body. */
  verifyWebhook(input: { rawBody: string; signature: string | null }): WebhookVerification;

  /** Issue a refund against an existing successful payment. */
  refund(input: {
    providerPaymentId: string;
    amountPaise: number;
    notes?: Record<string, string>;
  }): Promise<RefundResult>;
}

// ───────────────────────────────────────────────────────────────────────────
// Razorpay HMAC helper (exported for unit tests)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Razorpay computes the webhook signature as
 *   HMAC_SHA256(secret, rawBody)
 * encoded as a lowercase hex string. Match it in constant time.
 */
export function razorpaySign(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function razorpayVerify(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = razorpaySign(rawBody, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ───────────────────────────────────────────────────────────────────────────
// Mock provider — no network, used in dev + tests
// ───────────────────────────────────────────────────────────────────────────

/**
 * The mock provider mints deterministic-ish ids based on the booking code +
 * a UUID-ish suffix so we can correlate logs without a database round-trip.
 */
function mockId(prefix: string, code: string): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${code}_${suffix}`;
}

export const mockProvider: PaymentProvider = {
  name: 'mock',

  async createOrder({ bookingCode, amountPaise }) {
    return {
      provider: 'mock',
      providerOrderId: mockId('mock_order', bookingCode),
      amountPaise,
      currency: 'INR',
      receipt: bookingCode,
    };
  },

  verifyWebhook({ rawBody }) {
    // The mock provider treats the body as trusted JSON. The route handler
    // gates this behind a same-origin check + the booking code in the URL.
    try {
      const body = JSON.parse(rawBody) as {
        kind?: string;
        providerPaymentId?: string;
        providerOrderId?: string | null;
        amountPaise?: number;
        currency?: string;
        // Booking code echoed back to us. Required for both success and
        // failure events so the lifecycle service can resolve the booking.
        receipt?: string | null;
        reason?: string;
        providerRefundId?: string;
        // Phase 5 + 5.5 routing — when purpose !== 'booking', the
        // corresponding side-key must also be present.
        purpose?: 'booking' | 'extension' | 'rent' | 'electricity';
        extensionId?: string;
        rentInvoiceId?: string;
        electricityInvoiceId?: string;
      };
      if (!body.kind) return { ok: false, reason: 'missing event kind' };

      const purposeTag = ((): PaymentPurposeTag | { ok: false; reason: string } => {
        if (body.purpose === 'extension') {
          if (!body.extensionId) {
            return { ok: false, reason: 'purpose=extension requires extensionId' };
          }
          return { purpose: 'extension', extensionId: body.extensionId };
        }
        if (body.purpose === 'rent') {
          if (!body.rentInvoiceId) {
            return { ok: false, reason: 'purpose=rent requires rentInvoiceId' };
          }
          return { purpose: 'rent', rentInvoiceId: body.rentInvoiceId };
        }
        if (body.purpose === 'electricity') {
          if (!body.electricityInvoiceId) {
            return {
              ok: false,
              reason: 'purpose=electricity requires electricityInvoiceId',
            };
          }
          return { purpose: 'electricity', electricityInvoiceId: body.electricityInvoiceId };
        }
        return { purpose: 'booking' };
      })();
      if ('ok' in purposeTag && purposeTag.ok === false) return purposeTag;
      const tag = purposeTag as PaymentPurposeTag;

      if (body.kind === 'payment_succeeded') {
        if (!body.providerPaymentId || typeof body.amountPaise !== 'number') {
          return { ok: false, reason: 'malformed payment_succeeded' };
        }
        return {
          ok: true,
          event: {
            kind: 'payment_succeeded',
            providerPaymentId: body.providerPaymentId,
            providerOrderId: body.providerOrderId ?? null,
            amountPaise: body.amountPaise,
            currency: body.currency ?? 'INR',
            receipt: body.receipt ?? null,
            raw: body,
            ...tag,
          },
        };
      }
      if (body.kind === 'payment_failed') {
        if (!body.providerPaymentId) {
          return { ok: false, reason: 'malformed payment_failed' };
        }
        return {
          ok: true,
          event: {
            kind: 'payment_failed',
            providerPaymentId: body.providerPaymentId,
            providerOrderId: body.providerOrderId ?? null,
            receipt: body.receipt ?? null,
            reason: body.reason ?? 'unknown',
            raw: body,
            ...tag,
          },
        };
      }
      if (body.kind === 'refund_succeeded') {
        if (
          !body.providerPaymentId ||
          !body.providerRefundId ||
          typeof body.amountPaise !== 'number'
        ) {
          return { ok: false, reason: 'malformed refund_succeeded' };
        }
        return {
          ok: true,
          event: {
            kind: 'refund_succeeded',
            providerPaymentId: body.providerPaymentId,
            providerRefundId: body.providerRefundId,
            amountPaise: body.amountPaise,
            raw: body,
          },
        };
      }
      return { ok: false, reason: `unknown kind "${body.kind}"` };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'invalid JSON',
      };
    }
  },

  async refund({ providerPaymentId, amountPaise }) {
    return {
      providerRefundId: `mock_rfnd_${providerPaymentId.slice(-8)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      amountPaise,
      status: 'succeeded',
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Razorpay provider — thin HTTP shim
// ───────────────────────────────────────────────────────────────────────────

const RAZORPAY_BASE = 'https://api.razorpay.com/v1';

function razorpayAuthHeader(): string {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error(
      'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set when PAYMENT_PROVIDER=razorpay',
    );
  }
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

export const razorpayProvider: PaymentProvider = {
  name: 'razorpay',

  async createOrder({ bookingCode, amountPaise, notes }) {
    // ALWAYS include booking_code in notes — Razorpay echoes notes back on
    // payment.captured AND payment.failed events, and our webhook handler
    // uses it to resolve the booking row. Allow caller-provided notes to
    // augment but never override the booking_code we depend on.
    const mergedNotes = { ...(notes ?? {}), booking_code: bookingCode };
    const res = await fetch(`${RAZORPAY_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: razorpayAuthHeader(),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: bookingCode,
        notes: mergedNotes,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Razorpay createOrder failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as {
      id: string;
      amount: number;
      currency: string;
      receipt: string;
    };
    return {
      provider: 'razorpay',
      providerOrderId: body.id,
      amountPaise: body.amount,
      currency: 'INR',
      receipt: body.receipt,
    };
  },

  verifyWebhook({ rawBody, signature }) {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      return { ok: false, reason: 'RAZORPAY_WEBHOOK_SECRET is not configured' };
    }
    if (!signature) {
      return { ok: false, reason: 'missing x-razorpay-signature header' };
    }
    if (!razorpayVerify(rawBody, signature, secret)) {
      return { ok: false, reason: 'signature mismatch' };
    }

    // Razorpay event payload shape (subset we care about):
    //   { event, payload: { payment: { entity: { ... } } } }
    // or { event: 'refund.processed', payload: { refund: { entity }, payment: { entity } } }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'invalid JSON',
      };
    }
    const evt = parsed as {
      event?: string;
      payload?: {
        payment?: { entity?: Record<string, unknown> };
        refund?: { entity?: Record<string, unknown> };
      };
    };

    const payment = evt.payload?.payment?.entity;
    const refund = evt.payload?.refund?.entity;

    /**
     * Phase 5 — read the routing tag we stuffed into `notes.kind`/`notes.extension_id`
     * when creating the Razorpay order. When absent (default), the payment
     * is treated as a primary-booking payment and dispatched through the
     * Phase-4 lifecycle. The validator returns 400 if we get `kind=extension`
     * without an `extension_id`.
     */
    const readPurpose = (
      notes: Record<string, unknown> | undefined,
    ): PaymentPurposeTag | { ok: false; reason: string } => {
      const k = notes?.kind;
      if (k === 'extension') {
        const eid = notes?.extension_id;
        if (typeof eid !== 'string' || eid.length === 0) {
          return { ok: false, reason: 'notes.kind=extension requires notes.extension_id' };
        }
        return { purpose: 'extension', extensionId: eid };
      }
      if (k === 'rent') {
        const rid = notes?.rent_invoice_id;
        if (typeof rid !== 'string' || rid.length === 0) {
          return { ok: false, reason: 'notes.kind=rent requires notes.rent_invoice_id' };
        }
        return { purpose: 'rent', rentInvoiceId: rid };
      }
      if (k === 'electricity') {
        const eid = notes?.electricity_invoice_id;
        if (typeof eid !== 'string' || eid.length === 0) {
          return {
            ok: false,
            reason: 'notes.kind=electricity requires notes.electricity_invoice_id',
          };
        }
        return { purpose: 'electricity', electricityInvoiceId: eid };
      }
      return { purpose: 'booking' };
    };

    // Only payment.captured flips booking state. payment.authorized can fire
    // before capture and must not be treated as settled funds.
    if (evt.event === 'payment.captured') {
      if (!payment?.id || typeof payment.amount !== 'number') {
        return { ok: false, reason: 'malformed payment payload' };
      }
      const notes = payment.notes as Record<string, unknown> | undefined;
      const tagOrErr = readPurpose(notes);
      if ('ok' in tagOrErr && tagOrErr.ok === false) return tagOrErr;
      const tag = tagOrErr as PaymentPurposeTag;
      return {
        ok: true,
        event: {
          kind: 'payment_succeeded',
          providerPaymentId: String(payment.id),
          providerOrderId: payment.order_id ? String(payment.order_id) : null,
          amountPaise: payment.amount as number,
          currency: (payment.currency as string) ?? 'INR',
          receipt: (notes as { booking_code?: string } | undefined)?.booking_code ?? null,
          raw: parsed,
          ...tag,
        },
      };
    }
    if (evt.event === 'payment.failed') {
      if (!payment?.id) {
        return { ok: false, reason: 'malformed payment.failed payload' };
      }
      // Razorpay echoes the `notes` we attached to the order back onto the
      // payment entity — we set `booking_code` (and `kind`/`extension_id`
      // for extensions) in createOrder(), so the failed branch can resolve
      // the booking AND route to the right lifecycle handler.
      const notes = payment.notes as Record<string, unknown> | undefined;
      const tagOrErr = readPurpose(notes);
      if ('ok' in tagOrErr && tagOrErr.ok === false) return tagOrErr;
      const tag = tagOrErr as PaymentPurposeTag;
      return {
        ok: true,
        event: {
          kind: 'payment_failed',
          providerPaymentId: String(payment.id),
          providerOrderId: payment.order_id ? String(payment.order_id) : null,
          receipt: (notes as { booking_code?: string } | undefined)?.booking_code ?? null,
          reason:
            (payment.error_description as string | undefined) ?? 'payment failed',
          raw: parsed,
          ...tag,
        },
      };
    }
    if (evt.event === 'refund.processed' || evt.event === 'refund.created') {
      if (!refund?.id || !payment?.id || typeof refund.amount !== 'number') {
        return { ok: false, reason: 'malformed refund payload' };
      }
      return {
        ok: true,
        event: {
          kind: 'refund_succeeded',
          providerPaymentId: String(payment.id),
          providerRefundId: String(refund.id),
          amountPaise: refund.amount as number,
          raw: parsed,
        },
      };
    }
    return { ok: false, reason: `unhandled event "${evt.event ?? 'unknown'}"` };
  },

  async refund({ providerPaymentId, amountPaise, notes }) {
    const res = await fetch(
      `${RAZORPAY_BASE}/payments/${encodeURIComponent(providerPaymentId)}/refund`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: razorpayAuthHeader(),
        },
        body: JSON.stringify({ amount: amountPaise, notes }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Razorpay refund failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as {
      id: string;
      amount: number;
      status: string;
    };
    return {
      providerRefundId: body.id,
      amountPaise: body.amount,
      status: body.status === 'processed' ? 'succeeded' : 'pending',
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Provider selection
// ───────────────────────────────────────────────────────────────────────────

/**
 * Returns the active payment provider per the `PAYMENT_PROVIDER` env. Read
 * fresh on each call so tests can flip the env between cases.
 */
export function getPaymentProvider(): PaymentProvider {
  return env.PAYMENT_PROVIDER === 'razorpay' ? razorpayProvider : mockProvider;
}
