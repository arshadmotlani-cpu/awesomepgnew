'use client';

import { useEffect, useState } from 'react';
import { useSidebarLayout } from '@/src/components/admin/sidebar/SidebarLayoutProvider';

export function SidebarDragStatusBanner() {
  const { setDragEnabled } = useSidebarLayout();
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
    <div className="mx-3 mb-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100">
      <p>{message}</p>
      <button
        type="button"
        className="mt-1 text-[10px] font-semibold text-amber-50 underline hover:no-underline"
        onClick={() => {
          setDragEnabled(true);
          setMessage(null);
        }}
      >
        Retry drag
      </button>
    </div>
  );
}
