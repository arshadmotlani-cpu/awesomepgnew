'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RoachieSpotlight } from './RoachieSpotlight';
import { MASCOT_IMAGES } from '@/src/lib/cockroach/mascotAssets';
import {
  ONBOARDING_STEPS,
  tourTargetSelector,
  type OnboardingStep,
} from '@/src/lib/cockroach/onboardingSteps';
import {
  markOnboardingComplete,
  markOnboardingSkipped,
} from '@/src/lib/cockroach/onboardingStorage';

type Props = {
  onFinished: () => void;
};

function findTourTarget(key: string | null): HTMLElement | null {
  if (!key || typeof document === 'undefined') return null;
  const el = document.querySelector(tourTargetSelector(key));
  return el instanceof HTMLElement ? el : null;
}

function measureTarget(el: HTMLElement | null): DOMRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
}

export function RoachieTourWidget({ onFinished }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [talking, setTalking] = useState(false);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const timerRef = useRef<number | null>(null);

  const step: OnboardingStep = ONBOARDING_STEPS[stepIndex]!;
  const subStep = step.subSteps[subIndex] ?? step.subSteps[0]!;
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  const pose = step.pose;
  const message = subStep.message;

  const refreshSpotlight = useCallback(() => {
    const target = findTourTarget(subStep.target);
    if (target) {
      target.classList.add('roachie-target-highlight');
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTargetMissing(false);
      setSpotRect(measureTarget(target));
    } else {
      setTargetMissing(true);
      setSpotRect(null);
    }
  }, [subStep.target]);

  useEffect(() => {
    const enter = window.setTimeout(() => setVisible(true), 120);
    return () => window.clearTimeout(enter);
  }, []);

  useEffect(() => {
    refreshSpotlight();

    function onLayout() {
      const target = findTourTarget(subStep.target);
      setSpotRect(measureTarget(target));
    }

    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    return () => {
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
      for (const node of document.querySelectorAll('.roachie-target-highlight')) {
        node.classList.remove('roachie-target-highlight');
      }
    };
  }, [subStep.target, refreshSpotlight]);

  const advance = useCallback(() => {
    setTalking(true);
    window.setTimeout(() => setTalking(false), 480);

    const hasMoreSub = subIndex < step.subSteps.length - 1;
    if (hasMoreSub) {
      setSubIndex((i) => i + 1);
      return;
    }

    if (isLastStep) {
      markOnboardingComplete();
      onFinished();
      return;
    }

    setStepIndex((i) => i + 1);
    setSubIndex(0);
  }, [isLastStep, onFinished, step.subSteps.length, subIndex]);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const delay = subStep.durationMs;
    if (delay > 0) {
      timerRef.current = window.setTimeout(advance, delay);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [advance, stepIndex, subIndex, subStep.durationMs]);

  function handleSkip() {
    markOnboardingSkipped();
    onFinished();
  }

  const progress = `${stepIndex + 1} / ${ONBOARDING_STEPS.length}`;
  const showNext = subStep.durationMs === 0 || step.subSteps.length > 1;

  return (
    <>
      <div className="roachie-tour-scrim" data-cockroach-ignore aria-hidden />
      <RoachieSpotlight rect={spotRect} />

      <div
        className={`roachie-widget roachie-tour-widget ${visible ? 'roachie-widget--visible' : ''} ${talking ? 'roachie-widget--talking' : ''}`}
        data-cockroach-ignore
        role="dialog"
        aria-label="Roachie booking guide"
      >
        <div className="roachie-tour-widget__header">
          <span className="roachie-tour-widget__progress">{progress}</span>
          <button
            type="button"
            className="roachie-tour-widget__skip"
            onClick={handleSkip}
          >
            Skip tour
          </button>
        </div>

        <div className="roachie-tour-widget__body">
          <Image
            src={MASCOT_IMAGES[pose]}
            alt=""
            width={88}
            height={88}
            quality={95}
            className="roachie-widget__mascot-img roachie-tour-widget__mascot"
          />
          <div className="roachie-tour-widget__copy">
            <p className="roachie-tour-widget__message">{message}</p>
            {targetMissing && step.fallbackNote ? (
              <p className="roachie-tour-widget__fallback">{step.fallbackNote}</p>
            ) : null}
          </div>
        </div>

        <div className="roachie-tour-widget__footer">
          {showNext || isLastStep ? (
            <button
              type="button"
              className="roachie-tour-widget__next"
              onClick={advance}
            >
              {isLastStep ? 'Done' : 'Next'}
            </button>
          ) : (
            <span className="roachie-tour-widget__hint">Auto-advancing…</span>
          )}
        </div>
      </div>
    </>
  );
}
