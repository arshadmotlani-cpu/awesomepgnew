'use client';

import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RoachieSpotlight } from '@/src/components/cockroach/RoachieSpotlight';
import { COCKROACH_AI_NAME } from '@/src/lib/cockroach/branding';
import { MASCOT_IMAGES } from '@/src/lib/cockroach/mascotAssets';
import { BOOK_THIS_BED, HOLD_THIS_BED } from '@/src/lib/booking/bookingFunnelLabels';
import { formatDate } from '@/src/lib/format';

type CoachStep = {
  targetSelector: string;
  message: string;
  label: string;
};

function measureTarget(root: HTMLElement, selector: string): DOMRect | null {
  const el = root.querySelector(selector);
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
}

function buildSteps(root: HTMLElement, opensDate?: string | null): CoachStep[] {
  const opensLabel = opensDate ? formatDate(opensDate) : 'when the bed opens';
  const steps: CoachStep[] = [];

  if (root.querySelector('[data-roachie-bed-action="pre-book"]')) {
    steps.push({
      targetSelector: '[data-roachie-bed-action="pre-book"]',
      label: HOLD_THIS_BED,
      message: `${HOLD_THIS_BED} means you plan to check in on ${opensLabel} — when this bed opens and the current guest leaves.`,
    });
  }

  if (root.querySelector('[data-roachie-bed-action="book"]')) {
    steps.push({
      targetSelector: '[data-roachie-bed-action="book"]',
      label: BOOK_THIS_BED,
      message: `${BOOK_THIS_BED} if you are moving in on your selected dates right away — the bed is free now.`,
    });
  }

  if (root.querySelector('[data-roachie-bed-action="reserve"]')) {
    steps.push({
      targetSelector: '[data-roachie-bed-action="reserve"]',
      label: `${HOLD_THIS_BED} (50% rent)`,
      message: opensDate
        ? `${HOLD_THIS_BED} (50% rent) means you are not checking in on ${opensLabel}. You hold the bed now and pick your move-in day when you arrive.`
        : `${HOLD_THIS_BED} (50% rent) holds this bed at half rent until you choose your check-in day.`,
    });
  }

  return steps;
}

export function RoachieBedSheetCoach({
  sheetRootId,
  opensDate,
}: {
  sheetRootId: string;
  opensDate?: string | null;
}) {
  const [steps, setSteps] = useState<CoachStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    const root = document.getElementById(sheetRootId);
    if (!root) return;

    const sync = () => {
      const built = buildSteps(root, opensDate);
      setSteps(built);
      if (built.length > 0) {
        setStepIndex(0);
        window.setTimeout(() => setVisible(true), 80);
      }
    };

    sync();
    const retry = window.setTimeout(sync, 120);
    return () => window.clearTimeout(retry);
  }, [sheetRootId, opensDate]);

  const current = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;

  const refreshSpotlight = useCallback(() => {
    const root = document.getElementById(sheetRootId);
    if (!root || !current) {
      setSpotRect(null);
      return;
    }

    for (const node of root.querySelectorAll('.roachie-target-highlight')) {
      node.classList.remove('roachie-target-highlight');
    }

    const target = root.querySelector(current.targetSelector);
    if (target instanceof HTMLElement) {
      target.classList.add('roachie-target-highlight');
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setSpotRect(measureTarget(root, current.targetSelector));
      return;
    }
    setSpotRect(null);
  }, [current, sheetRootId]);

  useEffect(() => {
    if (!visible || !current) return;
    refreshSpotlight();

    function onLayout() {
      refreshSpotlight();
    }

    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    return () => {
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
      const root = document.getElementById(sheetRootId);
      for (const node of root?.querySelectorAll('.roachie-target-highlight') ?? []) {
        node.classList.remove('roachie-target-highlight');
      }
    };
  }, [visible, current, refreshSpotlight, sheetRootId]);

  if (!mounted || steps.length === 0 || !current || !visible) return null;

  return createPortal(
    <>
      <div className="roachie-bed-sheet-coach-scrim" data-cockroach-ignore aria-hidden />
      <RoachieSpotlight rect={spotRect} />
      <div
        className={`roachie-widget roachie-tour-widget roachie-bed-sheet-coach ${visible ? 'roachie-widget--visible' : ''}`}
        data-cockroach-ignore
        role="dialog"
        aria-label={`${COCKROACH_AI_NAME} explains pre-book and reserve`}
      >
        <div className="roachie-tour-widget__header">
          <span className="roachie-tour-widget__progress">
            {COCKROACH_AI_NAME} · {stepIndex + 1} / {steps.length}
          </span>
          <button
            type="button"
            className="roachie-tour-widget__skip"
            onClick={() => setVisible(false)}
          >
            Got it
          </button>
        </div>
        <div className="roachie-tour-widget__body">
          <div className="roachie-tour-widget__copy">
            <p className="text-[0.7rem] font-bold uppercase tracking-wide text-[#ffcc00]">
              {current.label}
            </p>
            <p className="roachie-tour-widget__message">{current.message}</p>
          </div>
          <Image
            src={MASCOT_IMAGES.welcome}
            alt=""
            width={96}
            height={96}
            quality={95}
            className="roachie-widget__mascot-img roachie-tour-widget__mascot"
          />
        </div>
        <div className="roachie-tour-widget__footer">
          <button
            type="button"
            className="roachie-tour-widget__back"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            aria-label="Previous"
          >
            ← Back
          </button>
          <button
            type="button"
            className="roachie-tour-widget__next"
            onClick={() => {
              if (isLast) setVisible(false);
              else setStepIndex((i) => i + 1);
            }}
            aria-label={isLast ? 'Close guide' : 'Next'}
          >
            {isLast ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
