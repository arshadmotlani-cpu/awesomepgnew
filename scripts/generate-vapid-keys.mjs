#!/usr/bin/env node
/**
 * Generate VAPID keys for Web Push. Add output to your environment:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY (same as VAPID_PUBLIC_KEY)
 *   VAPID_SUBJECT=mailto:admin@awesomepg.com
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('Add these to your environment (e.g. Vercel → Settings → Environment Variables):\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:admin@awesomepg.com');
