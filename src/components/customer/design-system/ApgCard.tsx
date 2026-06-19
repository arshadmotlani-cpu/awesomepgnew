import type { ReactNode } from 'react';
import { elevation, surface } from '@/src/lib/design-system/tokens';

type Tier = 'base' | 'card' | 'floating' | 'account';

const tierClass: Record<Tier, string> = {
  base: '',
  card: `${elevation.card} ${surface.darkGlass}`,
  floating: `${elevation.floating} ${surface.darkGlass}`,
  account: surface.accountPadded,
};

type Props = {
  tier?: Tier;
  className?: string;
  children: ReactNode;
  as?: 'div' | 'section' | 'article';
};

export function ApgCard({
  tier = 'card',
  className = '',
  children,
  as: Tag = 'div',
}: Props) {
  return <Tag className={`${tierClass[tier]} ${className}`.trim()}>{children}</Tag>;
}
