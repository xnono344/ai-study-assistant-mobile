export interface RevenueCatKeys {
  ios?: string;
  android?: string;
  test?: string;
}

export function resolveRevenueCatApiKey(
  platform: string,
  isExpoGo: boolean,
  keys: RevenueCatKeys,
): string | undefined {
  if (isExpoGo) {
    return keys.test?.startsWith('test_') ? keys.test : undefined;
  }

  return platform === 'ios' ? keys.ios : keys.android;
}
