'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { COCKROACH_AI_NAME } from '@/src/lib/cockroach/branding';
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
import { scrollTourTargetToCenter } from '@/src/lib/cockroach/scrollTourTarget';

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

  const step: OnboardingStep = ONBOARDING_STEPS[stepIndex]!;
  const subStep = step.subSteps[subIndex] ?? step.subSteps[0]!;
  const isFirstStep = stepIndex === 0 && subIndex === 0;
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  const isLastSubStep = subIndex >= step.subSteps.length - 1;
  const pose = step.pose;
  const message = subStep.message;

  const pulseTalking = useCallback(() => {
    setTalking(true);
    window.setTimeout(() => setTalking(false), 480);
  }, []);

  const refreshSpotlight = useCallback(() => {
    const target = findTourTarget(subStep.target);
    if (target) {
      target.classList.add('roachie-target-highlight');
      scrollTourTargetToCenter(target);
      setTargetMissing(false);
      window.setTimeout(() => setSpotRect(measureTarget(target)), 280);
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
    pulseTalking();

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
  }, [isLastStep, onFinished, pulseTalking, step.subSteps.length, subIndex]);

  const goBack = useCallback(() => {
    if (isFirstStep) return;
    pulseTalking();

    if (subIndex > 0) {
      setSubIndex((i) => i - 1);
      return;
    }

    const prevStep = ONBOARDING_STEPS[stepIndex - 1]!;
    setStepIndex((i) => i - 1);
    setSubIndex(prevStep.subSteps.length - 1);
  }, [isFirstStep, pulseTalking, stepIndex, subIndex]);

  function handleSkip() {
    markOnboardingSkipped();
    onFinished();
  }

  const totalSubSteps = ONBOARDING_STEPS.reduce((n, s) => n + s.subSteps.length, 0);
  let subStepNumber = 0;
  for (let i = 0; i < stepIndex; i++) {
    subStepNumber += ONBOARDING_STEPS[i]!.subSteps.length;
  }
  subStepNumber += subIndex + 1;
  const progress = `${subStepNumber} / ${totalSubSteps}`;

  return (
    <>
      <div className="roachie-tour-scrim" data-cockroach-ignore aria-hidden />
      <RoachieSpotlight rect={spotRect} />

      <div
        className={`roachie-widget roachie-tour-widget ${visible ? 'roachie-widget--visible' : ''} ${talking ? 'roachie-widget--talking' : ''}`}
        data-cockroach-ignore
        role="dialog"
        aria-label={`${COCKROACH_AI_NAME} booking guide`}
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
          <div className="roachie-tour-widget__copy">
            <p className="roachie-tour-widget__message">{message}</p>
            {targetMissing && step.fallbackNote ? (
              <p className="roachie-tour-widget__fallback">{step.fallbackNote}</p>
            ) : null}
          </div>

          <Image
            src={MASCOT_IMAGES[pose]}
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
            onClick={goBack}
            disabled={isFirstStep}
            aria-label="Previous tip"
          >
            ← Back
          </button>
          <button
            type="button"
            className="roachie-tour-widget__next"
            onClick={advance}
            aria-label={isLastStep && isLastSubStep ? 'Finish tour' : 'Next tip'}
          >
            {isLastStep && isLastSubStep ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  );
}
