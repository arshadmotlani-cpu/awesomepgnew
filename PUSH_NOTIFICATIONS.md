# Push Notifications (PWA) — Setup

Awesome PG Admin supports **Web Push** when installed to the home screen (Add to Home Screen).

## 1. Generate VAPID keys

```bash
node scripts/generate-vapid-keys.mjs
# or: npx web-push generate-vapid-keys
```

Set in production environment (Vercel → Environment Variables):

```
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same public key>
VAPID_SUBJECT=mailto:admin@yourdomain.com
```

**Push will not work without these keys.** The client checks `/api/push/vapid-public-key` before subscribing; if it returns 503, no permission prompt or subscription is created.

## 2. Install on phone

1. Delete any old home-screen shortcut first (clears stale manifest/icons).
2. Open `/admin` in Chrome (Android) or Safari (iOS 16.4+).
3. **Add to Home Screen** — icon should show orange **APG** branding.
4. Open the installed app, log in, and tap **Enable notifications** (browser requires a user tap before showing the permission dialog).
5. Verify at **Admin → System health → Push diagnostics**.

## 3. Architecture

| Layer | Location |
|-------|----------|
| DB | `notifications`, `push_subscriptions` (migration `0074`) |
| Event engine | `src/services/notificationEngine.ts` |
| Web Push | `src/lib/push/webPush.ts` |
| Client registration | `src/lib/push/clientRegistration.ts` |
| Service worker | `public/sw.js` (scope `/`) |
| Manifest | `public/manifest.webmanifest` (`name` / `short_name`: Awesome PG) |
| Icons | `public/icons/apg-admin-*.png` |
| Subscribe API | `POST /api/push/subscribe` |
| Diagnostics | `GET /api/push/diagnostics`, `/admin/system/push-diagnostics` |
| Test push | `POST /api/push/test` |
| Badge SSOT | Unread rows in `notifications` (not ops queue) |

## 4. Registration flow (login → DB row)

1. Admin layout mounts `AdminPushRegistration`.
2. Service worker registers: `navigator.serviceWorker.register('/sw.js', { scope: '/' })`.
3. `navigator.serviceWorker.ready` resolves.
4. Client fetches `GET /api/push/vapid-public-key` — **stops here if keys missing**.
5. User taps **Enable notifications** → `Notification.requestPermission()` (only if `default`).
6. `PushManager.subscribe()` with VAPID application server key.
7. `POST /api/push/subscribe` upserts row in `push_subscriptions`.

## 5. Event sources

- `syncAdminNotificationsFromActionItems` → payment proof, KYC, checkout, etc.
- `createBooking` (customer) → `booking_created`
- `qrPayments` proof upload → triggers action item sync

Dedup: `(audience, user_id, dedupe_key)` unique constraint.

## 6. Verification

1. Open **Push diagnostics** — all rows should show OK.
2. Tap **Send test notification** — device receives push.
3. Upload payment proof as resident → admin phone shows **Payment review required**.
4. Home-screen badge = unread notification count.
5. Tap notification → opens deep link (e.g. payment reviews).
6. Mark read → badge clears on all devices after poll/sync.
