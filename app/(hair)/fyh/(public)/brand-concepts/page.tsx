import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Brand mark concepts · review only',
  robots: { index: false, follow: false },
};

const MARKS = [
  {
    src: '/brand-concepts/01-fyhair-scissors.svg',
    name: 'For Your Hair',
    note: 'Bottle-green + brass abstract scissors (favicon-safe).',
  },
  {
    src: '/brand-concepts/02-awesomepg-bed-key.svg',
    name: 'Awesome PG',
    note: 'Bed frame + key — exact-bed booking, not a house icon.',
  },
  {
    src: '/brand-concepts/03-capital-ledger-bars.svg',
    name: 'Automotive Capital',
    note: 'Ascending ledger / TVI bars on a deal baseline.',
  },
  {
    src: '/brand-concepts/04-owner-os-ring.svg',
    name: 'Owner OS',
    note: 'Open net-worth ring — personal life OS.',
  },
  {
    src: '/brand-concepts/05-platform-nodes.svg',
    name: 'Platform',
    note: 'Neutral parent node grid (orchestration, not a vertical).',
  },
] as const;

export default function BrandConceptsReviewPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        margin: 0,
        padding: '2rem',
        background: '#0a0a0a',
        color: '#e5e5e5',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
        Brand mark concepts (review only)
      </h1>
      <p style={{ color: '#a3a3a3', maxWidth: '42rem', lineHeight: 1.5, marginTop: '0.75rem' }}>
        Not wired into favicons or app chrome yet. Confirm which marks to keep before we replace
        live brand assets.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '1.5rem',
          marginTop: '2rem',
        }}
      >
        {MARKS.map((mark) => (
          <figure
            key={mark.src}
            style={{
              margin: 0,
              padding: '1rem',
              border: '1px solid #262626',
              borderRadius: 12,
              background: '#141414',
            }}
          >
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mark.src} width={64} height={64} alt={`${mark.name} 64`} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mark.src} width={32} height={32} alt={`${mark.name} 32`} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mark.src} width={16} height={16} alt={`${mark.name} 16`} />
            </div>
            <figcaption style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              <strong>{mark.name}</strong>
            </figcaption>
            <p style={{ fontSize: '0.75rem', color: '#737373', marginTop: '0.35rem' }}>{mark.note}</p>
          </figure>
        ))}
      </div>
    </main>
  );
}
