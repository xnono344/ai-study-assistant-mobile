/**
 * useAuth — Google OAuth + anonymous session management.
 * Stores tokens in expo-secure-store (Keychain/Keystore).
 * Communicates with backend to exchange OAuth code for tokens.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api, cancelAllPendingRequests } from '../lib/api';
import { configurePurchases } from '../lib/subscription';
import { clearAllData } from '../lib/offline';
import i18n from '../lib/i18n';
import { SESSION_KEY, getOrCreateSessionId, resetSessionIdCache } from '../lib/session';

const ACCESS_TOKEN_KEY = 'nexus_access_token';
const REFRESH_TOKEN_KEY = 'nexus_refresh_token';
const USER_KEY = 'nexus_user';
const OAUTH_STATE_KEY = 'nexus_oauth_state';
const CODE_VERIFIER_KEY = 'nexus_code_verifier';
const OAUTH_CLIENT_ID_KEY = 'nexus_oauth_client_id';

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/generative-language',
];

export interface User {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  googleConnected: boolean;
  subscriptionTier: 'free' | 'premium';
  isAnonymous: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

let authStateListeners: Set<(state: AuthState) => void> = new Set();
let currentAuthState: AuthState = { user: null, isLoading: true, error: null };

function setAuthState(newState: Partial<AuthState>) {
  currentAuthState = { ...currentAuthState, ...newState };
  authStateListeners.forEach((l) => l(currentAuthState));
}

function useAuthState() {
  const [state, setState] = useState<AuthState>(currentAuthState);
  useEffect(() => {
    authStateListeners.add(setState);
    return () => {
      authStateListeners.delete(setState);
    };
  }, []);
  return state;
}

async function getApiBase(): Promise<string> {
  return Constants.expoConfig?.extra?.apiBase ?? 'http://127.0.0.1:8000';
}

async function apiCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = await getApiBase();
  const sessionId = await getOrCreateSessionId();
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);

  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('X-Session-Id', sessionId);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export function useAuth() {
  const state = useAuthState();
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    bootstrap();
    // bootstrap is a stable callback; this one-shot guard also prevents repeats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const sessionId = await getOrCreateSessionId();
      const userJson = await SecureStore.getItemAsync(USER_KEY);
      if (userJson) {
        // Corrupted SecureStore entries (e.g. partial writes from a crash)
        // would otherwise throw a SyntaxError at boot and brick the app.
        // Recover by deleting the bad entry and falling through to anonymous.
        let restoredUser: User;
        try {
          restoredUser = JSON.parse(userJson);
          setAuthState({ user: restoredUser, isLoading: false });
        } catch (parseErr: any) {
          if (__DEV__) console.warn('[useAuth] discarding corrupted user blob:', parseErr?.message);
          await SecureStore.deleteItemAsync(USER_KEY);
          restoredUser = {
            id: sessionId,
            isAnonymous: true,
            googleConnected: false,
            subscriptionTier: 'free',
          };
          // Persist the recovered anonymous user so a hot restart doesn't
          // keep falling through this corrupted-blob branch on every launch.
          try {
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(restoredUser));
          } catch {}
          setAuthState({ user: restoredUser, isLoading: false });
        }
        // Bind RevenueCat to the restored user id so entitlement checks have
        // a valid customer identity from the very first render.
        try {
          await configurePurchases(restoredUser.id);
        } catch (e: any) {
          if (__DEV__) console.warn('[useAuth] revenuecat configure failed:', e?.message ?? e);
        }
        return;
      }
      const anonymousUser: User = {
        id: sessionId,
        isAnonymous: true,
        googleConnected: false,
        subscriptionTier: 'free',
      };
      // First-launch / cleared-state case: persist the anonymous user so a
      // hot restart sees the same identity instead of minting a new UUID
      // on every bootstrap. Without this, anything that reads USER_KEY
      // expecting it to be set (e.g. session-scoped UI logic) would see
      // an empty store and double-mint an id.
      try {
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(anonymousUser));
      } catch {}
      setAuthState({ user: anonymousUser, isLoading: false });
      try {
        await configurePurchases(anonymousUser.id);
      } catch (e: any) {
        if (__DEV__) console.warn('[useAuth] revenuecat configure failed:', e?.message ?? e);
      }
    } catch {
      setAuthState({ error: i18n.t('errors.generic'), isLoading: false });
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthState({ isLoading: true, error: null });
    try {
      const clientId = Platform.OS === 'ios'
        ? Constants.expoConfig?.extra?.googleClientIdIos
        : Constants.expoConfig?.extra?.googleClientIdAndroid;

      if (!clientId) {
        throw new Error('Google Client ID not configured. Add EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS / _ANDROID to .env');
      }

      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'nexusstudy',
        native: 'nexusstudy://oauth',
      });

      const request = new AuthSession.AuthRequest({
        clientId,
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        scopes: SCOPES,
        usePKCE: true,
        prompt: AuthSession.Prompt.Consent,
        extraParams: { access_type: 'offline' },
      });
      await request.makeAuthUrlAsync(GOOGLE_DISCOVERY);
      const state = request.state;
      const codeVerifier = request.codeVerifier;
      if (!codeVerifier) throw new Error('Unable to initialize OAuth PKCE');

      await SecureStore.setItemAsync(OAUTH_STATE_KEY, state);
      await SecureStore.setItemAsync(CODE_VERIFIER_KEY, codeVerifier);
      await SecureStore.setItemAsync(OAUTH_CLIENT_ID_KEY, clientId);

      const result = await request.promptAsync(GOOGLE_DISCOVERY);

      if (result.type === 'success' && typeof result.params.code === 'string') {
        const returnedState = typeof result.params.state === 'string'
          ? result.params.state
          : '';
        await exchangeCode(result.params.code, returnedState);
      } else if (result.type === 'error') {
        // Map provider-side errors to a translated message. The raw
        // provider text is intentionally discarded — it's user-facing English
        // regardless of locale.
        setAuthState({ error: i18n.t('auth.signInFailedBody'), isLoading: false });
        throw new Error(i18n.t('auth.signInFailedBody'));
      } else {
        setAuthState({ error: i18n.t('auth.signInFailedBody'), isLoading: false });
        throw new Error(i18n.t('auth.signInFailedBody'));
      }
    } catch (e: any) {
      // Catch-all for any error not already mapped above. Avoid leaking raw
      // exception messages — they may contain code/state/redirect details.
      const existing = currentAuthState.error;
      if (!existing) setAuthState({ error: i18n.t('errors.generic'), isLoading: false });
      throw e;
    }
    // exchangeCode is stable (it has no dependencies) and is declared below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exchangeCode = useCallback(async (code: string, state: string) => {
    // CSRF check: the `state` we minted and stashed before redirecting to
    // Google must come back unchanged. Without this, a malicious redirect
    // could trick the app into exchanging an attacker's authorization code.
    const storedState = await SecureStore.getItemAsync(OAUTH_STATE_KEY);
    const codeVerifier = await SecureStore.getItemAsync(CODE_VERIFIER_KEY);
    const clientId = await SecureStore.getItemAsync(OAUTH_CLIENT_ID_KEY);
    if (!storedState || storedState !== state) {
      throw new Error('OAuth state mismatch — possible CSRF, aborting sign-in');
    }
    if (!codeVerifier || !clientId) {
      throw new Error('OAuth PKCE session is incomplete');
    }
    // Delete state IMMEDIATELY to prevent replay — the code is single-use
    // and must not be allowed to be exchanged twice if the request is
    // retried or interrupted.
    await Promise.all([
      SecureStore.deleteItemAsync(OAUTH_STATE_KEY),
      SecureStore.deleteItemAsync(CODE_VERIFIER_KEY),
      SecureStore.deleteItemAsync(OAUTH_CLIENT_ID_KEY),
    ]);

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'nexusstudy',
      native: 'nexusstudy://oauth',
    });
    const response = await apiCall<{
      user: User;
      access_token: string;
      refresh_token: string;
    }>('/api/v1/auth/google/exchange', {
      method: 'POST',
      body: JSON.stringify({ code, redirect_uri: redirectUri, state, code_verifier: codeVerifier, client_id: clientId }),
    });

    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, response.access_token);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, response.refresh_token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(response.user));

    setAuthState({ user: response.user, isLoading: false, error: null });
  }, []);

  const validateCallback = useCallback(async (state: string): Promise<boolean> => {
    const storedState = await SecureStore.getItemAsync(OAUTH_STATE_KEY);
    if (!storedState || storedState !== state) {
      return false;
    }
    return true;
  }, []);

  const continueAnonymously = useCallback(async () => {
    setAuthState({ isLoading: true });
    const sessionId = await getOrCreateSessionId();
    const user: User = {
      id: sessionId,
      isAnonymous: true,
      googleConnected: false,
      subscriptionTier: 'free',
    };
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    setAuthState({ user, isLoading: false, error: null });
  }, []);

  const signOut = useCallback(async () => {
    // GDPR: revoke server-side tokens before clearing local storage.
    // Best-effort — network failures shouldn't block local sign-out, but
    // we still log so the issue isn't silent.
    try {
      await api.auth.disconnect();
    } catch (e: any) {
      if (__DEV__) console.warn('[useAuth] server-side disconnect failed:', e?.message ?? e);
    }
    // Cancel any in-flight API requests for the previous user so they don't
    // resolve after the SecureStore wipe and write stale data with the old
    // session id. Also avoids race-y state when re-signing in immediately.
    cancelAllPendingRequests();
    // Wipe the offline cache so a new sign-in (or a fresh anonymous session)
    // doesn't see the previous user's lessons. Best-effort — a SQLite failure
    // shouldn't block local sign-out.
    try {
      await clearAllData();
    } catch (e: any) {
      if (__DEV__) console.warn('[useAuth] offline cache clear failed:', e?.message ?? e);
    }
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(OAUTH_STATE_KEY);
    await SecureStore.deleteItemAsync(CODE_VERIFIER_KEY);
    await SecureStore.deleteItemAsync(OAUTH_CLIENT_ID_KEY);
    const newSession = Crypto.randomUUID();
    const anonymousUser: User = {
      id: newSession,
      isAnonymous: true,
      googleConnected: false,
      subscriptionTier: 'free',
    };
    // Persist the new anonymous user so a hot restart / next bootstrap sees
    // a consistent USER_KEY instead of having to fall through to the
    // "no-user" branch and re-mint a separate identity.
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(anonymousUser));
    await SecureStore.setItemAsync(SESSION_KEY, newSession);
    // Reset the single-flight sessionIdPromise cache so the next call to
    // generateSessionId re-reads from SecureStore instead of returning the
    // previous user's session id.
    resetSessionIdCache();
    setAuthState({
      user: anonymousUser,
      isLoading: false,
    });
    // Re-bind RevenueCat to the new anonymous user id so entitlements don't
    // remain associated with the previous account's appUserID.
    try {
      await configurePurchases(newSession);
    } catch (e: any) {
      if (__DEV__) console.warn('[useAuth] revenuecat reconfigure failed:', e?.message ?? e);
    }
  }, []);

  const disconnectGoogle = useCallback(async () => {
    // Best-effort: ask the server to revoke. Network failures shouldn't
    // block the local disconnect.
    try { await api.auth.disconnect(); } catch (e: any) {
      if (__DEV__) console.warn('[useAuth] server-side disconnect failed:', e?.message ?? e);
    }
    // Wipe the offline cache so the previous Google-account's data doesn't
    // linger locally after disconnect (matches the signOut hygiene).
    try { await clearAllData(); } catch (e: any) {
      if (__DEV__) console.warn('[useAuth] offline cache clear failed:', e?.message ?? e);
    }
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    if (state.user) {
      const updated = { ...state.user, googleConnected: false };
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(updated));
      setAuthState({ user: updated });
    }
  }, [state.user]);

  return {
    user: state.user,
    isLoading: state.isLoading,
    error: state.error,
    signInWithGoogle,
    continueAnonymously,
    signOut,
    exchangeCode,
    validateCallback,
    disconnectGoogle,
  };
}
