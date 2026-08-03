import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RESIDENT_AUTH_COPY,
  buildResidentAuthHref,
  isValidEmailFormat,
  parseResidentAuthNotice,
  residentAuthNoticeContent,
  validateResidentEmailInput,
  validateResidentPasswordInput,
} from '@/src/lib/auth/residentAuthCopy';

describe('residentAuthCopy validation', () => {
  it('rejects empty and invalid emails without implying a server check', () => {
    assert.equal(validateResidentEmailInput('').message, RESIDENT_AUTH_COPY.emptyEmail);
    assert.equal(validateResidentEmailInput('not-an-email').message, RESIDENT_AUTH_COPY.invalidEmail);
    assert.equal(isValidEmailFormat('a@b.com'), true);
    assert.deepEqual(validateResidentEmailInput('  a@b.com '), { ok: true, email: 'a@b.com' });
  });

  it('rejects empty password with exact copy', () => {
    assert.equal(validateResidentPasswordInput('').message, RESIDENT_AUTH_COPY.emptyPassword);
    assert.deepEqual(validateResidentPasswordInput('secret'), { ok: true });
  });

  it('never uses Sign In or email-or-password ambiguity', () => {
    const blob = JSON.stringify(RESIDENT_AUTH_COPY);
    assert.doesNotMatch(blob, /Sign In|sign in|email or password/i);
    assert.equal(RESIDENT_AUTH_COPY.incorrectPassword, 'Incorrect password.');
  });
});

describe('residentAuthCopy notices and hrefs', () => {
  it('maps welcome_back and no_account notices', () => {
    assert.equal(parseResidentAuthNotice('welcome_back'), 'welcome_back');
    assert.equal(parseResidentAuthNotice('no_account'), 'no_account');
    assert.equal(parseResidentAuthNotice('other'), null);

    const welcome = residentAuthNoticeContent('welcome_back');
    assert.equal(welcome.title, 'Welcome back!');
    assert.match(welcome.body, /account already exists/i);
    assert.doesNotMatch(welcome.body, /Sign [Ii]n/);

    const missing = residentAuthNoticeContent('no_account');
    assert.match(missing.title, /couldn.t find an account/i);
    assert.match(missing.body, /create one/i);
  });

  it('preserves email when building Login ↔ Sign Up hrefs', () => {
    assert.equal(
      buildResidentAuthHref({
        email: 'resident@example.com',
        notice: 'welcome_back',
        next: '/account/profile',
      }),
      '/login?next=%2Faccount%2Fprofile&email=resident%40example.com&notice=welcome_back',
    );
    assert.equal(
      buildResidentAuthHref({
        signup: true,
        email: 'new@example.com',
        notice: 'no_account',
      }),
      '/login?signup=1&email=new%40example.com&notice=no_account',
    );
  });
});
