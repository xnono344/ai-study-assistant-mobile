/**
 * API client — unified HTTP client with auth, retry, abort, and offline queue.
 * Talks to backend (FastAPI) at the configured base URL.
 */

// SECURITY: Certificate pinning is defined in lib/certPinning.ts but
// not yet enforced in fetch. For production, install react-native-cert-pinner
// or react-native-ssl-pinning and wire the pins from getActivePins().

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { getOrCreateSessionId } from './session';

const ACCESS_TOKEN_KEY = 'nexus_access_token';

const pendingRequests = new Map<string, AbortController>();

function getApiBase(): string {
  const base = Constants.expoConfig?.extra?.apiBase as string | undefined;
  if (!base && !__DEV__) {
    throw new Error('EXPO_PUBLIC_API_BASE must be set in production');
  }
  return base ?? 'http://127.0.0.1:8000';
}

async function getHeaders(): Promise<Headers> {
  const sessionId = await getOrCreateSessionId();
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('X-Session-Id', sessionId);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return headers;
}

export class ApiError extends Error {
  status: number;
  body: string;
  detail: string | null = null;
  constructor(message: string, status: number) {
    // Never include raw response body in user-facing message
    super(message);
    this.status = status;
    this.name = 'ApiError';
    this.body = message;  // Store full body separately for logging
  }
  static fromResponse(res: Response, body: string): ApiError {
    const err = new ApiError(res.statusText, res.status);
    try {
      const parsed = JSON.parse(body);
      err.detail = parsed.detail || parsed.message || body;
    } catch {
      err.detail = body || res.statusText;
    }
    return err;
  }
}

export async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const base = getApiBase();
  const headers = await getHeaders();
  if (init.headers) {
    new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  }

  // Best-effort cert-pinning sanity check (see lib/certPinning.ts).
  // Currently this only validates the host is on the pinned-host list.
  // Real TLS validation requires a native module (see SECURITY comment above).
  const fullUrl = `${base}${path}`;
  const { pinCertificateForUrl } = await import('./certPinning');
  const pinOk = await pinCertificateForUrl(fullUrl);
  if (!pinOk) {
    throw new ApiError('Connection refused', 0);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 180_000);

  const reqId = Crypto.randomUUID();
  pendingRequests.set(reqId, controller);

  try {
    const res = await fetch(fullUrl, { ...init, headers, signal: controller.signal });
    if (res.status === 401) {
      // Token expired/invalid. Throw a typed ApiError so callers (and the
      // signOut flow in useAuth) can detect a 401 and trigger re-auth
      // without having to parse message strings. We don't broadcast on a
      // global event bus here — that decision lives in the hook layer so
      // tests can stub it.
      throw new ApiError('Session expired. Please sign in again.', 401);
    }
    if (!res.ok) {
      // Capture body for FastAPI error parsing; do NOT include raw body in
      // the user-facing message. The full body lives on `ApiError.body` for
      // logging, and structured `detail` is parsed into `ApiError.detail`.
      const text = await res.text();
      const err = ApiError.fromResponse(res, text);
      err.body = text;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    // Some 200s return empty bodies (e.g. DELETE on a backend that returns
    // 200 + "{}", or void endpoints). Guard the parse so an unexpected
    // empty body doesn't throw a SyntaxError up into the caller.
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('Invalid JSON response', res.status);
    }
  } finally {
    clearTimeout(timer);
    pendingRequests.delete(reqId);
  }
}

export function cancelAllPendingRequests() {
  pendingRequests.forEach((c) => c.abort());
  pendingRequests.clear();
}

// ── Domain API methods ──

export const api = {
  health: () => request<{ status: string }>('/api/health', { timeoutMs: 5_000 }),

  // Generic verb helper. Domain methods below should call this for one-off
  // endpoints that don't have their own slice (lessons, auth, etc. already
  // declare their own typed helpers).
  delete: <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' }),

  auth: {
    exchangeCode: (code: string, redirectUri: string, state: string) =>
      request<{ user: any; access_token: string; refresh_token: string }>(
        '/api/v1/auth/google/exchange',
        { method: 'POST', body: JSON.stringify({ code, redirect_uri: redirectUri, state }) }
      ),
    refresh: (refreshToken: string) =>
      request<{ access_token: string }>('/api/v1/auth/google/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }),
    disconnect: () => request<void>('/api/v1/auth/google/disconnect', { method: 'POST' }),
  },

  lessons: {
    list: () => request<LessonSummary[]>('/api/v1/lessons', { timeoutMs: 30_000 }),
    create: (input: { title: string; subject: string; level: string; chapter?: string }) =>
      request<LessonSummary>('/api/v1/lessons', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    get: (id: string) => request<LessonSummary>(`/api/v1/lessons/${id}`),
    workspace: (id: string) => request<LessonWorkspace>(`/api/v1/lessons/${id}/workspace`),
    process: (id: string) => request<{ lesson_id: string; status: string; sections: number; concepts: number }>(
      `/api/v1/lessons/${id}/process`,
      { method: 'POST', timeoutMs: 300_000 }
    ),
    remove: (id: string) => request<void>(`/api/v1/lessons/${id}`, { method: 'DELETE' }),
  },

  progress: {
    get: () => request<Progress>('/api/v1/progress', { timeoutMs: 30_000 }),
  },

  sessions: {
    create: (input: { lesson_id: string; duration_minutes?: number }) =>
      request<StudySession>('/api/v1/progress/sessions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, patch: any) =>
      request<StudySession>(`/api/v1/progress/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
  },

  sections: {
    complete: (id: string, confidence: 'low' | 'medium' | 'high' = 'medium') =>
      request<{ id: string; section_id: string; completed: boolean; confidence: string }>(
        `/api/v1/progress/sections/${id}/complete`,
        { method: 'POST', body: JSON.stringify({ confidence }) }
      ),
  },

  exercises: {
    attempt: (id: string, answer: string, timeSpentSeconds: number) =>
      request<{ id: string; is_correct: boolean }>(`/api/v1/exercises/${id}/attempt`, {
        method: 'POST',
        body: JSON.stringify({ answer, time_spent_seconds: timeSpentSeconds }),
      }),
  },

  questions: {
    ask: (lesson_id: string, question: string) =>
      request<{ answer: string; source_refs: string[] }>('/api/v1/questions', {
        method: 'POST',
        body: JSON.stringify({ lesson_id, question }),
      }),
  },

  uploads: {
    create: async (file: { uri: string; name: string; type: string }, onProgress?: (p: number) => void) => {
      // Backend endpoint accepts multipart/form-data
      const base = getApiBase();
      const sessionId = await getOrCreateSessionId();
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);

      const formData = new FormData();
      // @ts-ignore — RN FormData accepts this shape
      formData.append('file', { uri: file.uri, name: file.name, type: file.type });

      const xhr = new XMLHttpRequest();
      xhr.timeout = 180_000;  // 3 min timeout for large file uploads
      return new Promise<{ id: string; filename: string }>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Invalid JSON')); }
          } else {
            reject(new ApiError(`Upload failed: ${xhr.status}`, xhr.status));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));
        xhr.open('POST', `${base}/api/v1/uploads`);
        xhr.setRequestHeader('X-Session-Id', sessionId);
        if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        xhr.send(formData as any);
      });
    },
  },

  search: (q: string, type?: 'lesson' | 'concept' | 'exercise') =>
    request<SearchResult[]>(`/api/v1/search?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ''}`, { timeoutMs: 15_000 }),

  subscription: {
    status: () => request<SubscriptionStatus>('/api/v1/subscription/status'),
    sync: (customerInfo: any) =>
      request<{ synced: true }>('/api/v1/subscription/sync', {
        method: 'POST',
        body: JSON.stringify({ revenuecat_customer_info: customerInfo }),
      }),
    openPortal: () => request<{ url: string }>('/api/v1/subscription/portal'),
  },

  account: {
    export: () => request<{ download_url: string; expires_at: string }>('/api/v1/account/export'),
    delete: () =>
      api.delete<{ deleted: boolean; message: string }>('/api/v1/account'),
  },

  notifications: {
    registerToken: (token: string, platform: 'ios' | 'android') =>
      request<void>('/api/v1/notifications/register', {
        method: 'POST',
        body: JSON.stringify({ token, platform }),
      }),
    updatePreferences: (prefs: Record<string, boolean>) =>
      request<void>('/api/v1/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(prefs),
      }),
  },
};

// ── Types ──

export interface LessonSummary {
  id: string;
  title: string;
  subject: string;
  level: string;
  chapter: string | null;
  introduction: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonWorkspace {
  id: string;
  title: string;
  subject: string;
  level: string;
  chapter: string | null;
  introduction: string;
  progress: number;
  sources: any[];
  sections: Section[];
  generated: boolean;
}

export interface Section {
  id: string;
  title: string;
  content: string;
  summary: { quickReview: string; standard: string; revisionSheet: any };
  shortSummary?: string;
  keyPoints: string[];
  progress: number;
  importantPoints: ImportantPoint[];
  formulas: Formula[];
  definitions: Definition[];
  rules: Rule[];
  memorizationItems: MemorizationItem[];
  commonMistakes: string[];
  workedExamples: WorkedExample[];
  checklist: ChecklistItem[];
  exercises: Exercise[];
}

export interface ImportantPoint { id: string; text: string; importance: string; category: string; }
export interface Formula { id: string; latex: string; description: string; variables: Record<string, string>; }
export interface Definition { id: string; term: string; definition: string; }
export interface Rule { id: string; name: string; statement: string; conditions: string[]; }
export interface MemorizationItem { id: string; text: string; hint?: string; }
export interface WorkedExample { id: string; problem: string; solutionSteps: string[]; }
export interface ChecklistItem { id: string; text: string; type: string; sectionId: string; priority: number; completed: boolean; }
export interface Exercise { id: string; title: string; content: string; difficulty: 'easy' | 'medium' | 'hard'; hasSolution: boolean; sourceName: string; sourceUrl: string; isAiGenerated: boolean; }

export interface Progress {
  total_lessons: number;
  total_study_time_minutes: number;
  study_time_today_minutes: number;
  study_time_this_week_minutes: number;
  exercises_attempted: number;
  exercises_completed: number;
  streak_days: number;
  weekly: { date: string; day: string; minutes: number; hours: number }[];
  per_lesson: { lesson_id: string; title: string; subject: string; level: string; progress_pct: number; sections_total: number; sections_completed: number; }[];
  weak_areas: any[];
}

export interface StudySession {
  id: string;
  lesson_id: string;
  duration_minutes: number;
  sections_studied: string[];
  exercises_attempted: number;
  exercises_correct: number;
  created_at?: string;
}

export interface SubscriptionStatus {
  tier: 'free' | 'premium';
  is_active: boolean;
  expires_at: string | null;
  grace_period_ends_at: string | null;
  will_renew: boolean;
  family_share: boolean;
}

export interface SearchResult {
  type: 'lesson' | 'concept' | 'exercise';
  id: string;
  title: string;
  snippet: string;
  lesson_id?: string;
  section_id?: string;
}

/**
 * Map any caught error to a localized {title, message} pair for user-facing
 * alerts. Returns translation keys (e.g. 'errors.unauthorized') — pass the
 * `title` and `message` through `t()` at the call site.
 */
export function getErrorMessage(error: unknown): { title: string; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 401) return { title: 'common.error', message: 'errors.unauthorized' };
    if (error.status === 403) return { title: 'common.error', message: 'errors.forbidden' };
    if (error.status === 404) return { title: 'common.error', message: 'errors.notFound' };
    if (error.status === 429) return { title: 'common.error', message: 'errors.rateLimited' };
    if (error.status >= 500) return { title: 'common.error', message: 'errors.serverError' };
    return { title: 'common.error', message: error.detail || 'errors.generic' };
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { title: 'common.error', message: 'errors.timeout' };
  }
  return { title: 'common.error', message: 'errors.network' };
}
