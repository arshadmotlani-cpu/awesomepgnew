'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { RoachieReminder } from './RoachieReminder';
import { RoachieRecall } from './RoachieRecall';
import { RoachieTourWidget } from './RoachieTourWidget';
import {
  shouldRunOnboardingTour,
  shouldShowRoachieGuide,
} from '@/src/lib/cockroach/guidePaths';
import { MASCOT_IMAGES } from '@/src/lib/cockroach/mascotAssets';
import { shouldRunOnboarding } from '@/src/lib/cockroach/onboardingStorage';

type Props = {
  enabled?: boolean;
};

export function CockroachGuide({ enabled = true }: Props) {
  const pathname = usePathname() ?? '/';
  const peekEligible = enabled && shouldShowRoachieGuide(pathname);
  const tourEligible = enabled && shouldRunOnboardingTour(pathname) && shouldRunOnboarding();

  const [tourActive, setTourActive] = useState(false);
  const [tourDone, setTourDone] = useState(false);
  const [peekVisible, setPeekVisible] = useState(false);

  useEffect(() => {
    if (!tourEligible || tourDone) {
      setTourActive(false);
      return;
    }
    const start = window.setTimeout(() => setTourActive(true), 400);
    return () => window.clearTimeout(start);
  }, [tourEligible, tourDone, pathname]);

  const handleTourFinished = useCallback(() => {
    setTourActive(false);
    setTourDone(true);
  }, []);

  useEffect(() => {
    if (!peekEligible || tourActive || tourEligible && !tourDone) {
      setPeekVisible(false);
      return;
    }
    if (!shouldRunOnboarding()) {
      setPeekVisible(false);
      return;
    }

    const enterTimer = window.setTimeout(() => setPeekVisible(true), 180);
    return () => window.clearTimeout(enterTimer);
  }, [peekEligible, tourActive, tourEligible, tourDone, pathname]);

  if (tourActive) {
    return (
      <>
        <RoachieTourWidget onFinished={handleTourFinished} />
        <RoachieReminder />
        <RoachieRecall />
      </>
    );
  }

  return (
    <>
      {peekVisible ? (
        <div
          className={`roachie-peek ${peekVisible ? 'roachie-peek--visible' : ''}`}
          data-cockroach-ignore
          aria-hidden="true"
        >
          <Image
            src={MASCOT_IMAGES.welcome}
            alt=""
            width={192}
            height={192}
            quality={95}
            className="roachie-peek__img"
          />
        </div>
      ) : null}
      <RoachieReminder />
      <RoachieRecall />
    </>
  );
}
