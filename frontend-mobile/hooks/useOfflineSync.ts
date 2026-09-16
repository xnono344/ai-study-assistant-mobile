/**
 * useOfflineSync — background sync of queued mutations.
 * Polls every 30s when app is foreground + immediate on online event.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { api, ApiError } from '../lib/api';
import { getPendingSyncs, markSyncComplete, markSyncFailed } from '../lib/offline';

const POLL_INTERVAL = 30_000;
const MAX_RETRIES = 3;

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error' | 'pending';

export function useOfflineSync() {
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const { getCacheSize } = await import('../lib/offline');
      const size = await getCacheSize();
      setPendingCount(size.syncQueue);
    } catch {}
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setStatus('syncing');
    try {
      const pending = await getPendingSyncs();
      setPendingCount(pending.length);
      for (const item of pending) {
        if (item.retries >= MAX_RETRIES) {
          setStatus('error');
          continue;
        }
        try {
          const payload = JSON.parse(item.payload_json);
          // Guard: payload may be a primitive (null, number, array) if a
          // partial write corrupted the queue. Only object payloads have the
          // fields the API calls below expect.
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            await markSyncFailed(item.id, 'invalid_payload');
            continue;
          }
          if (item.entity === 'section_complete' && item.operation === 'CREATE') {
            if (!item.entity_id) { await markSyncFailed(item.id, 'missing_entity_id'); continue; }
            await api.sections.complete(item.entity_id, payload.confidence);
          } else if (item.entity === 'exercise_attempt' && item.operation === 'CREATE') {
            if (!item.entity_id) { await markSyncFailed(item.id, 'missing_entity_id'); continue; }
            await api.exercises.attempt(item.entity_id, payload.answer, payload.time_spent_seconds);
          } else if (item.entity === 'study_session' && item.operation === 'CREATE') {
            if (!payload.lesson_id) { await markSyncFailed(item.id, 'missing_lesson_id'); continue; }
            await api.sessions.create(payload);
          } else if (item.entity === 'study_session' && item.operation === 'UPDATE') {
            if (!item.entity_id) { await markSyncFailed(item.id, 'missing_entity_id'); continue; }
            await api.sessions.update(item.entity_id, payload);
          }
          await markSyncComplete(item.id);
        } catch (e: any) {
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
            await markSyncComplete(item.id);
          } else {
            await markSyncFailed(item.id, e?.message ?? 'unknown_error');
          }
        }
      }
      setStatus('synced');
      setLastSyncAt(new Date());
      await refreshPendingCount();
    } catch {
      setStatus('error');
    } finally {
      syncingRef.current = false;
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        sync();
      } else {
        setStatus('offline');
      }
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    const interval = setInterval(sync, POLL_INTERVAL);
    refreshPendingCount();

    return () => {
      unsubscribe();
      appStateSub.remove();
      clearInterval(interval);
    };
  }, [sync, refreshPendingCount]);

  return { status, pendingCount, lastSyncAt, manualSync: sync };
}
