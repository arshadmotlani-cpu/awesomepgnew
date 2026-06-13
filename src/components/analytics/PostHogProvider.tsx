'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, useState, type ReactNode } from 'react';

function posthogKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || undefined;
}

function posthogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const key = posthogKey();
    if (!key || posthog.__loaded) {
      setReady(true);
      return;
    }

    posthog.init(key, {
      api_host: posthogHost(),
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      persistence: 'localStorage+cookie',
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-ph-mask], [data-sensitive]',
      },
      sanitize_properties: (properties) => {
        const blocked = [
          'password',
          'aadhaar',
          'aadhar',
          'pan',
          'paymentScreenshotUrl',
          'payment_screenshot_url',
          'screenshot',
          'kyc',
        ];
        for (const key of blocked) {
          if (key in properties) delete properties[key];
        }
        return properties;
      },
    });

    setReady(true);
  }, []);

  if (!posthogKey()) return children;
  if (!ready) return children;

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

export function getPostHogSessionReplayUrl(): string | null {
  const key = posthogKey();
  if (!key) return null;
  const host = posthogHost().replace(/\/$/, '');
  return `${host}/replay`;
}
