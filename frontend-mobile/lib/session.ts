import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export const SESSION_KEY = 'nexus_session_id';

let sessionIdPromise: Promise<string> | null = null;

export function getOrCreateSessionId(): Promise<string> {
  if (sessionIdPromise) return sessionIdPromise;
  sessionIdPromise = (async () => {
    try {
      const existing = await SecureStore.getItemAsync(SESSION_KEY);
      if (existing) return existing;
      const id = Crypto.randomUUID();
      await SecureStore.setItemAsync(SESSION_KEY, id);
      return id;
    } catch (error) {
      sessionIdPromise = null;
      throw error;
    }
  })();
  return sessionIdPromise;
}

export function resetSessionIdCache() {
  sessionIdPromise = null;
}
