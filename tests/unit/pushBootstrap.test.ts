import { strict as assert } from 'node:assert';
import test from 'node:test';
import { decidePushUiAfterBootstrap } from '../../src/lib/push/clientRegistration';

const base = {
  serviceWorkerSupported: true,
  pushManagerSupported: true,
  vapidOk: true,
  notificationPermission: 'default' as NotificationPermission,
  localSubscription: false,
  serverHasMatchingEndpoint: false,
  serverHasAnySubscription: false,
  previouslyRegisteredLocally: false,
};

test('decidePushUiAfterBootstrap prompts only when no subscription signals exist', () => {
  assert.equal(decidePushUiAfterBootstrap(base).kind, 'prompt');
});

test('decidePushUiAfterBootstrap stays active when browser already has a subscription', () => {
  assert.equal(
    decidePushUiAfterBootstrap({ ...base, localSubscription: true }).kind,
    'active',
  );
});

test('decidePushUiAfterBootstrap stays active when server already has this endpoint', () => {
  assert.equal(
    decidePushUiAfterBootstrap({ ...base, serverHasMatchingEndpoint: true }).kind,
    'active',
  );
});

test('decidePushUiAfterBootstrap stays active when permission is granted', () => {
  assert.equal(
    decidePushUiAfterBootstrap({
      ...base,
      notificationPermission: 'granted',
    }).kind,
    'active',
  );
});

test('decidePushUiAfterBootstrap hides prompt after prior successful registration', () => {
  assert.equal(
    decidePushUiAfterBootstrap({
      ...base,
      previouslyRegisteredLocally: true,
      serverHasAnySubscription: true,
    }).kind,
    'active',
  );
});

test('decidePushUiAfterBootstrap does not reprompt iOS default permission with local subscription', () => {
  assert.equal(
    decidePushUiAfterBootstrap({
      ...base,
      notificationPermission: 'default',
      localSubscription: true,
    }).kind,
    'active',
  );
});

test('decidePushUiAfterBootstrap respects denied permission', () => {
  assert.equal(
    decidePushUiAfterBootstrap({
      ...base,
      notificationPermission: 'denied',
    }).kind,
    'denied',
  );
});
