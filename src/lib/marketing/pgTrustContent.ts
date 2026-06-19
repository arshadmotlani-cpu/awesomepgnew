/** Curated trust content per PG slug — presentation only until reviews API exists. */

export type PgReview = {
  quote: string;
  author: string;
  tenure: string;
};

export type NearbyPlace = {
  name: string;
  distance: string;
  category: string;
};

const DEFAULT_REVIEWS: PgReview[] = [
  {
    quote: 'Bed-first booking was real — I got the exact bed I picked online. Bills are transparent every month.',
    author: 'Verified resident',
    tenure: '6 months',
  },
  {
    quote: 'Gaming zone and chill room make it feel like more than a PG. Cleaning and laundry actually happen daily.',
    author: 'Verified resident',
    tenure: '1 year',
  },
];

const NEARBY_BY_CITY: Record<string, NearbyPlace[]> = {
  nagpur: [
    { name: 'Ambazari Lake', distance: '1.2 km', category: 'Outdoors' },
    { name: 'VR Mall', distance: '2.8 km', category: 'Shopping' },
    { name: 'Institute of Science', distance: '0.9 km', category: 'Transit hub' },
  ],
  default: [
    { name: 'Local market', distance: '5 min walk', category: 'Essentials' },
    { name: 'Bus stop', distance: '3 min walk', category: 'Transit' },
    { name: 'Cafe cluster', distance: '8 min walk', category: 'Food' },
  ],
};

export function reviewsForPg(_slug: string): PgReview[] {
  return DEFAULT_REVIEWS;
}

export function nearbyForCity(city: string): NearbyPlace[] {
  const key = city.toLowerCase().replace(/\s+/g, '');
  if (key.includes('nagpur')) return NEARBY_BY_CITY.nagpur;
  return NEARBY_BY_CITY.default;
}
