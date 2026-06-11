import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  formatElementContextForPrompt,
  formatPageContextForPrompt,
} from '../../src/lib/cockroach/pageContextBuilder';

test('formatPageContextForPrompt includes path and preview', () => {
  const text = formatPageContextForPrompt({
    pathname: '/pgs/shantinagar-awesome-pg',
    title: 'Awesome PG',
    headings: ['Rooms & beds'],
    buttons: ['Update dates'],
    links: ['Browse PGs'],
    sectionCount: 2,
    textPreview: 'Availability for move-in.',
  });

  assert.match(text, /Path: \/pgs\/shantinagar-awesome-pg/);
  assert.match(text, /Headings: Rooms & beds/);
  assert.match(text, /Availability for move-in/);
});

test('formatElementContextForPrompt describes visible element', () => {
  const text = formatElementContextForPrompt({
    tag: 'button',
    text: 'Update dates',
    role: null,
    inputType: 'submit',
    ariaLabel: null,
  });

  assert.match(text, /Tag: button/);
  assert.match(text, /Visible text: Update dates/);
});
