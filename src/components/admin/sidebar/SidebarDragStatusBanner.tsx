'use client';

import { useEffect, useState } from 'react';

export function SidebarDragStatusBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function onFail(e: Event) {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      setMessage(detail?.message ?? 'Drag unavailable');
    }
    window.addEventListener('sidebar-persist-failed', onFail);
    return () => window.removeEventListener('sidebar-persist-failed', onFail);
  }, []);

  if (!message) return null;

  return (
    <p className="mx-3 mb-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100">
      {message}
    </p>
  );
}
