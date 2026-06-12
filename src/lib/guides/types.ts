export type GuideLink = {
  label: string;
  href: string;
};

export type GuideArticle = {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  summary: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
  tip?: string;
  links?: GuideLink[];
};

export type GuideCatalog = {
  id: string;
  title: string;
  subtitle: string;
  articles: GuideArticle[];
};
