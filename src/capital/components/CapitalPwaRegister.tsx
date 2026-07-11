'use client';

import { useEffect } from 'react';

export function CapitalPwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/capital/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
