import type { ElementContext, PageContext } from './types';

/** @deprecated Use guideForTarget from guidePlaybook */
export function guideExplanation(args: {
  pageContext: PageContext;
  elementContext: ElementContext;
  index?: number;
}): string {
  return 'Browse Awesome PG properties and pick your exact bed.';
}
