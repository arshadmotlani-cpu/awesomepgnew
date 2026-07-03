/** Display-only featured PG ordering for Overview property performance table. */

export type FeaturedPgPattern = {
  label: string;
  match: (pgName: string) => boolean;
};

export const FEATURED_PG_PATTERNS: FeaturedPgPattern[] = [
  {
    label: 'CENTRAL - AWESOME PG',
    match: (name) => /central/i.test(name) && !/female/i.test(name),
  },
  {
    label: 'CENTRAL - AWESOME PG (Female)',
    match: (name) => /central/i.test(name) && /female/i.test(name),
  },
  {
    label: 'SHANTINAGAR - AWESOME PG',
    match: (name) => /shantinagar/i.test(name),
  },
  {
    label: 'TRIMURTI NAGAR - AWESOME PG',
    match: (name) => /trimurti/i.test(name),
  },
];
