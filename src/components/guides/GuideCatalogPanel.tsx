'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { GuideArticle, GuideCatalog } from '@/src/lib/guides/types';
import { groupArticlesByCategory, searchGuideArticles } from '@/src/lib/guides/searchGuides';

function GuideArticleCard({
  article,
  defaultOpen,
  tone,
}: {
  article: GuideArticle;
  defaultOpen?: boolean;
  tone: 'customer' | 'admin';
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  const border =
    tone === 'admin'
      ? 'border-white/10 bg-[#1A1F27]'
      : 'border-white/10 bg-apg-deep/60';
  const textMuted = tone === 'admin' ? 'text-apg-silver' : 'text-apg-silver';
  const linkClass =
    tone === 'admin'
      ? 'text-[#FF5A1F] hover:underline'
      : 'text-apg-orange hover:underline';

  return (
    <article className={`rounded-xl border ${border}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-semibold text-white">{article.title}</p>
          <p className={`mt-0.5 text-xs ${textMuted}`}>{article.summary}</p>
        </div>
        <span className={`shrink-0 text-lg ${textMuted}`} aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <div className={`space-y-3 border-t border-white/10 px-4 py-3 text-sm ${textMuted}`}>
          {article.paragraphs?.map((p) => (
            <p key={p.slice(0, 40)} className="leading-relaxed">
              {p}
            </p>
          ))}
          {article.steps?.length ? (
            <ol className="list-decimal space-y-1.5 pl-5">
              {article.steps.map((step) => (
                <li key={step.slice(0, 40)}>{step}</li>
              ))}
            </ol>
          ) : null}
          {article.bullets?.length ? (
            <ul className="list-disc space-y-1.5 pl-5">
              {article.bullets.map((b) => (
                <li key={b.slice(0, 40)}>{b}</li>
              ))}
            </ul>
          ) : null}
          {article.tip ? (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Tip: {article.tip}
            </p>
          ) : null}
          {article.links?.length ? (
            <div className="flex flex-wrap gap-3 pt-1">
              {article.links.map((link) => (
                <Link key={link.href} href={link.href} className={`text-xs font-semibold ${linkClass}`}>
                  {link.label} →
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function GuideCatalogPanel({
  catalog,
  tone,
  initialQuery = '',
}: {
  catalog: GuideCatalog;
  tone: 'customer' | 'admin';
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);

  const filtered = useMemo(
    () => searchGuideArticles(catalog.articles, query),
    [catalog.articles, query],
  );
  const grouped = useMemo(() => groupArticlesByCategory(filtered), [filtered]);

  const inputClass =
    tone === 'admin'
      ? 'rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2.5 text-sm text-white placeholder:text-apg-muted focus:border-[#FF5A1F]/50 focus:outline-none focus:ring-1 focus:ring-[#FF5A1F]/40'
      : 'rounded-lg border border-white/10 bg-apg-charcoal px-3 py-2.5 text-sm text-white placeholder:text-apg-muted focus:border-apg-orange/50 focus:outline-none focus:ring-1 focus:ring-apg-orange/40';

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="guide-search" className="sr-only">
          Search guide
        </label>
        <input
          id="guide-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — e.g. rent, KYC, vacating, payment proof, bed map…"
          className={`w-full ${inputClass}`}
        />
        <p className="mt-2 text-xs text-apg-silver">
          {filtered.length} topic{filtered.length === 1 ? '' : 's'}
          {query ? ` matching “${query}”` : ''}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-apg-silver">
          No topics match your search. Try different words like “electricity”, “deposit”, or “approve”.
        </p>
      ) : (
        grouped.map(({ category, articles }) => (
          <section key={category} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-apg-orange">
              {category}
            </h2>
            <div className="space-y-2">
              {articles.map((article, i) => (
                <GuideArticleCard
                  key={article.id}
                  article={article}
                  tone={tone}
                  defaultOpen={Boolean(query) && i === 0}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
