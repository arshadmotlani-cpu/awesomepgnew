'use client';

import { motion } from 'framer-motion';
import { Banknote, Car, Clock, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
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
  className?: string;
  index?: number;
};

export function KpiCard({
  title,
  valuePaise,
  valueText,
  subtitle,
  icon,
  trend = 'neutral',
  className,
  index = 0,
}: KpiCardProps) {
  const Icon = icon ? ICONS[icon] : null;
  const trendColor =
    trend === 'up' ? 'text-ac-success' : trend === 'down' ? 'text-ac-danger' : 'text-ac-text-muted';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <Card className={cn('transition-all hover:border-ac-accent/20', className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-ac-text-secondary">{title}</CardTitle>
          {Icon ? <Icon className={cn('h-4 w-4', trendColor)} /> : null}
        </CardHeader>
        <CardContent>
          <motion.div
            className="text-2xl font-semibold tracking-tight"
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            {valueText ??
              (valuePaise != null ? <MoneyDisplay paise={valuePaise} className="text-2xl" /> : '—')}
          </motion.div>
          {subtitle ? <p className="mt-1 text-xs text-ac-text-muted">{subtitle}</p> : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}
