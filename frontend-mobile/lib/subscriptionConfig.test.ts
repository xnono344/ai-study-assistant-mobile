/// <reference types="jest" />

import { resolveRevenueCatApiKey } from './subscriptionConfig';

const keys = {
  ios: 'appl_native',
  android: 'goog_native',
  test: 'test_preview',
};

describe('resolveRevenueCatApiKey', () => {
  it('uses a Test Store key in Expo Go', () => {
    expect(resolveRevenueCatApiKey('android', true, keys)).toBe('test_preview');
  });

  it('does not pass native store keys to Expo Go when no Test Store key exists', () => {
    expect(resolveRevenueCatApiKey('android', true, { android: 'goog_native' })).toBeUndefined();
  });

  it('uses the platform key outside Expo Go', () => {
    expect(resolveRevenueCatApiKey('ios', false, keys)).toBe('appl_native');
    expect(resolveRevenueCatApiKey('android', false, keys)).toBe('goog_native');
  });
});
