/**
 * Sentry error tracking — PII filtered.
 */

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = Constants.expoConfig?.extra?.sentryDsn as string | undefined;
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: __DEV__ ? 'development' : 'production',
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30000,
      beforeSend: (event) => {
        // Strip auth/identity headers
        if (event.request?.headers) {
          delete event.request.headers.Authorization;
          delete (event.request.headers as any)['X-Session-Id'];
          delete (event.request.headers as any)['Cookie'];
        }
        // Strip request body (could contain user-typed content, OAuth codes)
        if (event.request?.data) {
          delete event.request.data;
        }
        // Strip user context
        if (event.user) {
          event.user = undefined;
        }
        // Strip breadcrumbs that might contain PII
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((bc) => ({
            ...bc,
            data: bc.data ? { redacted: true } : undefined,
          }));
        }
        return event;
      },
      release: Constants.expoConfig?.version ?? require('../../package.json').version,
      tracesSampleRate: 0.01,  // was 0.1
      profilesSampleRate: 0.0, // was 0.1
    });
    initialized = true;
  } catch (e) {
    if (__DEV__) console.warn('sentry_init_failed', e);
  }
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (!initialized) return;
  Sentry.captureException(error, { extra: context });
}

export function addBreadcrumb(category: string, message: string, data?: any) {
  if (!initialized) return;
  Sentry.addBreadcrumb({ category, message, data, level: 'info' });
}
