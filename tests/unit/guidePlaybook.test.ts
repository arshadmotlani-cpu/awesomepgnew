import { strict as assert } from 'node:assert';
import test from 'node:test';
import { guideForTarget } from '../../src/lib/cockroach/guidePlaybook';

test('guideForTarget skips boring nav labels', () => {
  const el = {
    closest: () => null,
    dataset: {},
    matches: () => false,
    textContent: 'Browse',
  } as unknown as HTMLElement;

  assert.equal(
    guideForTarget({
      element: el,
      pageContext: {
        pathname: '/pgs',
        title: 'Browse',
        headings: [],
        buttons: [],
        links: [],
        sectionCount: 0,
        textPreview: '',
      },
      elementContext: { tag: 'a', text: 'Browse', role: null, inputType: null, ariaLabel: null },
    }),
    null,
  );
});

test('guideForTarget returns stay-dates tip on focus marker', () => {
  const el = {
    closest: (sel: string) => (sel === '[data-roachie-focus]' ? el : null),
    getAttribute: (name: string) => (name === 'data-roachie-focus' ? 'stay-dates' : null),
    dataset: { roachieFocus: 'stay-dates' },
    matches: () => false,
    textContent: 'Living here',
  } as unknown as HTMLElement;

  const tip = guideForTarget({
    element: el,
    pageContext: {
      pathname: '/pgs/shantinagar-awesome-pg',
      title: 'PG',
      headings: [],
      buttons: [],
      links: [],
      sectionCount: 1,
      textPreview: '',
    },
    elementContext: { tag: 'form', text: 'Living here', role: null, inputType: null, ariaLabel: null },
  });

  assert.match(tip ?? '', /Living here|14 days notice/i);
});
