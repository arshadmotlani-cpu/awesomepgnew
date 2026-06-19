'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { duration, easing } from '@/src/lib/design-system/motion';

export type TimelineStage = {
  id: string;
  label: string;
  description?: string;
};

type Props = {
  stages: TimelineStage[];
  activeIndex: number;
  orientation?: 'horizontal' | 'vertical';
};

export function StatusTimeline({
  stages,
  activeIndex,
  orientation = 'horizontal',
}: Props) {
  const reduceMotion = useReducedMotion();

  if (orientation === 'vertical') {
    return (
      <ol className="relative space-y-0 border-l border-zinc-200 pl-6">
        {stages.map((stage, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={stage.id} className="relative pb-8 last:pb-0">
              <motion.span
                className={`absolute -left-[1.65rem] flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white ${
                  done
                    ? 'bg-apg-orange text-white'
                    : active
                      ? 'bg-apg-orange text-white shadow-[0_0_16px_rgba(255,90,31,0.45)]'
                      : 'bg-zinc-100 text-zinc-500 ring-zinc-200'
                }`}
                initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: reduceMotion ? 0 : index * 0.08,
                  duration: duration.standard,
                  ease: easing.out,
                }}
              >
                {done ? '✓' : index + 1}
              </motion.span>
              <p className={`text-sm font-semibold ${active ? 'text-zinc-900' : done ? 'text-zinc-700' : 'text-zinc-400'}`}>
                {stage.label}
              </p>
              {stage.description ? (
                <p className="mt-0.5 text-xs text-zinc-500">{stage.description}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <nav aria-label="Progress">
      <ol className="flex items-center justify-between gap-1 sm:gap-2">
        {stages.map((stage, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={stage.id} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2 sm:text-left">
                <motion.span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? 'bg-apg-orange/20 text-apg-orange ring-1 ring-apg-orange/50'
                      : active
                        ? 'bg-apg-orange text-white shadow-[0_0_16px_rgba(255,90,31,0.55)]'
                        : 'bg-white/5 text-apg-muted ring-1 ring-white/10'
                  }`}
                  initial={reduceMotion ? false : { scale: 0.85 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: reduceMotion ? 0 : index * 0.06, duration: duration.quick }}
                >
                  {done ? '✓' : index + 1}
                </motion.span>
                <span
                  className={`truncate text-[10px] font-semibold leading-tight sm:text-xs ${
                    active ? 'text-white' : done ? 'text-apg-silver' : 'text-apg-muted'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {index < stages.length - 1 ? (
                <motion.div
                  className={`mx-1 hidden h-px min-w-[12px] flex-1 sm:block ${
                    done ? 'bg-gradient-to-r from-apg-orange/80 to-apg-orange/30' : 'bg-white/10'
                  }`}
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: reduceMotion ? 0 : index * 0.1, duration: duration.standard }}
                  style={{ originX: 0 }}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
