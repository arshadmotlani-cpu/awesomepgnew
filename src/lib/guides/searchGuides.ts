import type { GuideArticle } from '@/src/lib/guides/types';

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function articleHaystack(article: GuideArticle): string {
  return normalize(
    [
      article.title,
      article.category,
      article.summary,
      article.keywords.join(' '),
      ...(article.paragraphs ?? []),
      ...(article.steps ?? []),
      ...(article.bullets ?? []),
      article.tip ?? '',
    ].join(' '),
  );
}

export function searchGuideArticles(
  articles: GuideArticle[],
  query: string,
): GuideArticle[] {
  const q = normalize(query);
  if (!q) return articles;

  const tokens = q.split(' ').filter(Boolean);
  const scored = articles
    .map((article) => {
      const haystack = articleHaystack(article);
      let score = 0;
      for (const token of tokens) {
        if (normalize(article.title).includes(token)) score += 8;
        if (normalize(article.category).includes(token)) score += 4;
        if (article.keywords.some((k) => normalize(k).includes(token))) score += 6;
        if (haystack.includes(token)) score += 2;
      }
      return { article, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((row) => row.article);
}

export function groupArticlesByCategory(
  articles: GuideArticle[],
): Array<{ category: string; articles: GuideArticle[] }> {
  const map = new Map<string, GuideArticle[]>();
  for (const article of articles) {
    const list = map.get(article.category) ?? [];
    list.push(article);
    map.set(article.category, list);
  }
  return [...map.entries()].map(([category, grouped]) => ({ category, articles: grouped }));
}
