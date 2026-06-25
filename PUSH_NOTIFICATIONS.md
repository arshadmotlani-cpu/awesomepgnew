# Push Notifications (PWA) — Setup

Awesome PG Admin supports **Web Push** when installed to the home screen (Add to Home Screen).

## 1. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

Set in production environment:

```
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same public key>
VAPID_SUBJECT=mailto:admin@yourdomain.com
```

Push is disabled gracefully when keys are missing.

## 2. Install on phone

1. Open `/admin` in Chrome (Android) or Safari (iOS 16.4+).
2. **Add to Home Screen**.
3. Open the installed app and allow notifications when prompted.

## 3. Architecture

| Layer | Location |
|-------|----------|
| DB | `notifications`, `push_subscriptions` (migration `0074`) |
| Event engine | `src/services/notificationEngine.ts` |
| Web Push | `src/lib/push/webPush.ts` |
| Service worker | `public/sw.js` |
| Manifest | `public/manifest.webmanifest` |
| Subscribe API | `POST /api/push/subscribe` |
| Badge SSOT | Unread rows in `notifications` (not ops queue) |

## 4. Event sources

- `syncAdminNotificationsFromActionItems` → payment proof, KYC, checkout, etc.
- `createBooking` (customer) → `booking_created`
- `qrPayments` proof upload → triggers action item sync

Dedup: `(audience, user_id, dedupe_key)` unique constraint.

## 5. Verification

1. Upload payment proof as resident.
2. Within seconds, admin phone shows push: **Payment review required**.
3. Home-screen badge = unread notification count.
4. Tap notification → opens deep link (e.g. payment reviews).
5. Mark read → badge clears on all devices after poll/sync.
