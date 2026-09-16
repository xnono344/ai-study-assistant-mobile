/**
 * Offline-first storage using expo-sqlite (native) with localStorage fallback (web).
 * Caches lessons, sections, exercises for offline read.
 * Queues mutations (progress, exercise attempts) for background sync.
 */

import { Platform } from 'react-native';

export interface SyncQueueItem {
  id: number;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  entity_id: string | null;
  payload_json: string;
  created_at: number;
  retries: number;
  last_error?: string;
}

export interface CachedLesson {
  id: string;
  title: string;
  subject: string;
  level: string;
  chapter: string;
  introduction: string;
  data_json: string;
  synced_at: number;
  updated_at: number;
}

const DB_NAME = 'nexus-study.db';
let dbInstance: any = null;
let isWeb = Platform.OS === 'web';

// ── In-memory + localStorage shim for web ──
class WebShim {
  private data: Map<string, any[]> = new Map();
  private queue: any[] = [];
  private listeners: (() => void)[] = [];

  async execAsync(sql: string) {
    // No-op for schema; tables stored in memory
  }

  async runAsync(sql: string, params: any[] = []) {
    if (sql.startsWith('INSERT OR REPLACE INTO lessons')) {
      const [id, title, subject, level, chapter, introduction, data_json, synced_at, updated_at] = params;
      const existing = (this.data.get('lessons') ?? []).filter((r) => r.id !== id);
      existing.push({ id, title, subject, level, chapter, introduction, data_json, synced_at, updated_at });
      this.data.set('lessons', existing);
      this.persist();
    } else if (sql.startsWith('INSERT INTO sync_queue')) {
      // Fix: previously parsed column NAMES from the SQL string and used them
      // as the data values, so every queued row had `entity_id` set to a
      // column name. Read from params instead.
      const [operation, entity, entity_id, payload_json, created_at] = params;
      const id = this.queue.length + 1;
      this.queue.push({ id, operation, entity, entity_id, payload_json, created_at, retries: 0 });
      this.persist();
    } else if (sql.startsWith('DELETE FROM sync_queue')) {
      const id = params[0];
      this.queue = this.queue.filter((q) => q.id !== id);
      this.persist();
    } else if (sql.startsWith('UPDATE sync_queue')) {
      // params layout matches `UPDATE sync_queue SET retries = retries + 1,
      // last_error = ? WHERE id = ?`: [error, id]. The id was previously
      // parsed out of the SQL string with a regex, but the real call uses
      // a `?` placeholder — so the regex always returned null and the
      // update silently matched no row. Read from params instead.
      const error = params[0];
      const id = Number(params[1]);
      const item = this.queue.find((q) => q.id === id);
      if (item) { item.retries++; item.last_error = error; this.persist(); }
    } else if (sql.startsWith('DELETE FROM lessons')) {
      // For clearAllData
      this.data.set('lessons', []);
      this.persist();
    }
  }

  async getFirstAsync(sql: string, params: any[] = []): Promise<any | null> {
    if (sql.includes('FROM lessons WHERE id')) {
      const id = params[0];
      const row = (this.data.get('lessons') ?? []).find((r) => r.id === id);
      return row ?? null;
    }
    if (sql.includes('FROM sync_queue WHERE event_id')) {
      return null;
    }
    if (sql.includes('COUNT(*) as c FROM lessons')) {
      return { c: (this.data.get('lessons') ?? []).length };
    }
    if (sql.includes('COUNT(*) as c FROM sync_queue')) {
      return { c: this.queue.length };
    }
    return null;
  }

  async getAllAsync(sql: string, params: any[] = []): Promise<any[]> {
    if (sql.includes('SELECT data_json FROM lessons')) {
      return (this.data.get('lessons') ?? []).map((r) => ({ data_json: r.data_json }));
    }
    if (sql.includes('SELECT * FROM sync_queue')) {
      return [...this.queue];
    }
    return [];
  }

  private persist() {
    // localStorage can throw (private mode, quota exceeded, locked-down
    // webviews). Catch the error and fall back to in-memory — the rest of
    // the app still works, we just lose offline persistence on the web.
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('nexus-study:lessons', JSON.stringify(this.data.get('lessons') ?? []));
        localStorage.setItem('nexus-study:queue', JSON.stringify(this.queue));
      }
    } catch (e) {
      if (__DEV__) console.warn('[offline] localStorage persist failed:', e);
    }
  }

  load() {
    try {
      if (typeof localStorage !== 'undefined') {
        const lessons = localStorage.getItem('nexus-study:lessons');
        const queue = localStorage.getItem('nexus-study:queue');
        if (lessons) this.data.set('lessons', JSON.parse(lessons));
        if (queue) this.queue = JSON.parse(queue);
      }
    } catch {}
  }
}

let shim: WebShim | null = null;

// ── Main getDB function ──
export async function getDB(): Promise<any> {
  if (dbInstance) return dbInstance;

  if (isWeb) {
    shim = new WebShim();
    shim.load();
    dbInstance = shim;
    return dbInstance;
  }

  // Native: use real expo-sqlite
  const SQLite = await import('expo-sqlite');
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT,
      level TEXT,
      chapter TEXT,
      introduction TEXT,
      data_json TEXT NOT NULL,
      synced_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      retries INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
    CREATE INDEX IF NOT EXISTS idx_lessons_subject ON lessons(subject);
  `);
  dbInstance = db;
  return dbInstance;
}

export async function cacheLesson(lessonId: string, workspace: any) {
  const db = await getDB();
  const now = Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO lessons (id, title, subject, level, chapter, introduction, data_json, synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lessonId,
      workspace?.title ?? '',
      workspace?.subject ?? null,
      workspace?.level ?? null,
      workspace?.chapter ?? null,
      workspace?.introduction ?? null,
      JSON.stringify(workspace ?? {}),
      now,
      now,
    ]
  );
}

export async function getCachedLesson(lessonId: string): Promise<any | null> {
  const db = await getDB();
  const row = await db.getFirstAsync(
    'SELECT data_json FROM lessons WHERE id = ?',
    [lessonId]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.data_json);
  } catch {
    // Corrupted cache row (e.g. partial write from a crash) — skip instead
    // of throwing, which would brick any caller that needs the lesson.
    return null;
  }
}

export async function listCachedLessons(): Promise<any[]> {
  const db = await getDB();
  const rows = await db.getAllAsync(
    'SELECT data_json FROM lessons ORDER BY updated_at DESC'
  );
  return rows
    .map((r: any) => {
      try { return JSON.parse(r.data_json); } catch { return null; }
    })
    .filter(Boolean);
}

export async function enqueueSync(operation: 'CREATE' | 'UPDATE' | 'DELETE', entity: string, entityId: string | null, payload: any) {
  const db = await getDB();
  if (isWeb && shim) {
    const id = shim['queue'].length + 1;
    shim['queue'].push({
      id, operation, entity, entity_id: entityId,
      payload_json: JSON.stringify(payload), created_at: Date.now(), retries: 0,
    });
    shim['persist']();
    return;
  }
  await db.runAsync(
    'INSERT INTO sync_queue (operation, entity, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [operation, entity, entityId, JSON.stringify(payload), Date.now()]
  );
}

export async function getPendingSyncs(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAllAsync('SELECT * FROM sync_queue ORDER BY created_at ASC');
}

export async function markSyncComplete(id: number) {
  const db = await getDB();
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
}

export async function markSyncFailed(id: number, error: string) {
  const db = await getDB();
  await db.runAsync(
    'UPDATE sync_queue SET retries = retries + 1, last_error = ? WHERE id = ?',
    [error, id]
  );
}

export async function clearAllData() {
  const db = await getDB();
  if (isWeb && shim) {
    shim['data'].set('lessons', []);
    shim['queue'] = [];
    shim['persist']();
    return;
  }
  await db.execAsync('DELETE FROM lessons; DELETE FROM sync_queue;');
}

export async function getCacheSize(): Promise<{ lessons: number; syncQueue: number; bytes: number }> {
  const db = await getDB();
  const lessons = (await db.getFirstAsync('SELECT COUNT(*) as c FROM lessons'))?.c ?? 0;
  const syncQueue = (await db.getFirstAsync('SELECT COUNT(*) as c FROM sync_queue'))?.c ?? 0;
  return { lessons, syncQueue, bytes: 0 };
}
