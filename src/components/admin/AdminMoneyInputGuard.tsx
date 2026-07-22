'use client';

import { useEffect } from 'react';

/** Block trackpad / mouse wheel from changing focused admin money or number inputs. */
export function AdminMoneyInputGuard() {
  useEffect(() => {
    const root = document.querySelector('.apg-admin-shell');
    if (!root) return;

    const onWheel = (event: Event) => {
      const wheelEvent = event as WheelEvent;
      const target = wheelEvent.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (document.activeElement !== target) return;
      if (
        target.classList.contains('apg-admin-money-input') ||
        target.type === 'number'
      ) {
        wheelEvent.preventDefault();
      }
    };

    root.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => root.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  return null;
}
