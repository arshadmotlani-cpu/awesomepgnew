import type { ElementContext, PageContext } from './types';

const TIPS_BY_PATH: Array<{ match: RegExp; tips: string[] }> = [
  {
    match: /^\/pgs\/[^/]+\/rooms\//,
    tips: [
      'Pick the bed you want. Green beds are free for your move-in date.',
      'You can choose more than one bed if you are booking for friends too.',
      'Tap Continue when you are happy with your bed choice.',
    ],
  },
  {
    match: /^\/pgs\/[^/]+/,
    tips: [
      'Choose your move-in date at the top. Pick “Living here” if you do not know your check-out date yet.',
      'Each room card shows how many beds are free. Tap a room to pick your exact bed.',
      'Prices show per day, week, and month so you can compare easily.',
    ],
  },
  {
    match: /^\/pgs/,
    tips: [
      'Browse all Awesome PG homes here. Tap a PG to see rooms and beds.',
      'Use the search and filters to find a PG in your city.',
    ],
  },
  {
    match: /^\/booking\/new/,
    tips: [
      'Check your dates and bed list. Then fill in your details to continue.',
      'Living-here stays are billed monthly. You can leave later with 14 days notice.',
    ],
  },
  {
    match: /^\/account\/resident/,
    tips: [
      'This is your home dashboard. Pay rent and see your bills here.',
      'When you want to move out, submit a vacating request at least 14 days early.',
    ],
  },
];

function tipsForPath(pathname: string): string[] {
  for (const entry of TIPS_BY_PATH) {
    if (entry.match.test(pathname)) return entry.tips;
  }
  return [
    'Use the menu at the top to browse PGs, see bookings, or open your profile.',
    'Need help? Tap Support on WhatsApp in the bottom-right corner.',
  ];
}

export function guideExplanation(args: {
  pageContext: PageContext;
  elementContext: ElementContext;
  index?: number;
}): string {
  const tips = tipsForPath(args.pageContext.pathname);
  const idx = (args.index ?? 0) % tips.length;
  return tips[idx]!;
}
