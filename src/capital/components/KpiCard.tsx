'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Car,
  Clock,
  Minus,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { cn } from '@/src/capital/lib/utils';

const ICONS = {
  wallet: Wallet,
  banknote: Banknote,
  trendingUp: TrendingUp,
  car: Car,
  clock: Clock,
} as const satisfies Record<string, LucideIcon>;

export type KpiIconName = keyof typeof ICONS;

type KpiCardProps = {
  title: string;
  valuePaise?: number;
  valueText?: string;
  subtitle?: string;
  icon?: KpiIconName;
  trend?: 'up' | 'down' | 'neutral';
  changePct?: number | null;
  href?: string;
  className?: string;
  index?: number;
};

function useAnimatedNumber(target: number, enabled: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);
  return value;
}

export function KpiCard({
  title,
  valuePaise,
  valueText,
  subtitle,
  icon,
  trend = 'neutral',
  changePct,
  href,
  className,
  index = 0,
}: KpiCardProps) {
  const Icon = icon ? ICONS[icon] : null;
  const animatedPaise = useAnimatedNumber(valuePaise ?? 0, valuePaise != null);
  const TrendIcon =
    trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendColor =
    trend === 'up' ? 'text-ac-success' : trend === 'down' ? 'text-ac-danger' : 'text-ac-text-muted';

  const body = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04 }}
      whileHover={{ y: -4 }}
    >
      <Card
        className={cn(
          'ac-kpi-card h-full transition-all duration-300 hover:border-ac-accent/30 hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
          className,
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-0">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-ac-text-secondary">
            {title}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <TrendIcon className={cn('h-3.5 w-3.5', trendColor)} />
            {Icon ? (
              <span className="rounded-md bg-white/5 p-1.5">
                <Icon className={cn('h-3.5 w-3.5', trendColor)} />
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {valueText ??
              (valuePaise != null ? (
                <MoneyDisplay paise={animatedPaise} className="text-2xl" />
              ) : (
                '—'
              ))}
          </div>
          {changePct != null ? (
            <p className={cn('mt-1.5 text-xs font-medium', trendColor)}>
              {changePct > 0 ? '+' : ''}
              {changePct}% vs prior period
            </p>
          ) : subtitle ? (
            <p className="mt-1.5 text-xs text-ac-text-muted">{subtitle}</p>
          ) : (
            <p className="mt-1.5 text-xs text-ac-text-muted">vs previous period</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none">
        {body}
      </Link>
    );
  }
  return body;
}
