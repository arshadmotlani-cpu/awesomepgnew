import assert from 'node:assert/strict';
import test from 'node:test';
import { MASCOT_IMAGES, mascotPoseFor } from '../../src/lib/cockroach/mascotAssets';
import { ROACHIE_IDLE, ROACHIE_INTRO } from '../../src/lib/cockroach/guidePlaybook';

test('MASCOT_IMAGES points to public asset paths', () => {
  assert.equal(MASCOT_IMAGES.welcome, '/assets/cockroach-wave.png');
  assert.equal(MASCOT_IMAGES.warning, '/assets/cockroach-alert.png');
  assert.equal(MASCOT_IMAGES.success, '/assets/cockroach-happy.png');
});

test('mascotPoseFor uses welcome on intro and idle', () => {
  assert.equal(
    mascotPoseFor({
      message: ROACHIE_INTRO,
      pathname: '/pgs',
      introMessage: ROACHIE_INTRO,
      idleMessage: ROACHIE_IDLE,
    }),
    'welcome',
  );
  assert.equal(
    mascotPoseFor({
      message: ROACHIE_IDLE,
      pathname: '/pgs',
      introMessage: ROACHIE_INTRO,
      idleMessage: ROACHIE_IDLE,
    }),
    'welcome',
  );
});

test('mascotPoseFor uses warning for contextual tips', () => {
  assert.equal(
    mascotPoseFor({
      message: 'Women-only PG — double-check the gender badge.',
      pathname: '/pgs/shantinagar-awesome-pg',
      introMessage: ROACHIE_INTRO,
      idleMessage: ROACHIE_IDLE,
    }),
    'warning',
  );
});

test('mascotPoseFor uses success on payment-success pages', () => {
  assert.equal(
    mascotPoseFor({
      message: 'Anything',
      pathname: '/booking/APG-2026-001/payment-success',
      introMessage: ROACHIE_INTRO,
      idleMessage: ROACHIE_IDLE,
    }),
    'success',
  );
});
