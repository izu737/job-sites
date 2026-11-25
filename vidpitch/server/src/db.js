import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const db = new DatabaseSync(path.join(config.dataDir, 'vidpitch.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS videos (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    duration    REAL,
    width       INTEGER,
    height      INTEGER,
    gif_width   INTEGER,
    source_ext  TEXT NOT NULL,
    has_mp4     INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'processing',
    error       TEXT,
    cta_url     TEXT,
    cta_label   TEXT
  );
`);

const insertStmt = db.prepare(`
  INSERT INTO videos (id, title, created_at, duration, source_ext, cta_url, cta_label)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

export function createVideo({ id, title, duration, sourceExt, ctaUrl, ctaLabel }) {
  insertStmt.run(id, title, new Date().toISOString(), duration ?? null, sourceExt, ctaUrl || null, ctaLabel || null);
  return getVideo(id);
}

export function getVideo(id) {
  return db.prepare('SELECT * FROM videos WHERE id = ?').get(id) ?? null;
}

export function listVideos(limit = 50) {
  return db.prepare('SELECT * FROM videos ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function listProcessing() {
  return db.prepare("SELECT * FROM videos WHERE status = 'processing'").all();
}

const UPDATABLE = new Set(['title', 'duration', 'width', 'height', 'gif_width', 'has_mp4', 'status', 'error', 'cta_url', 'cta_label']);

export function updateVideo(id, fields) {
  const keys = Object.keys(fields).filter((k) => UPDATABLE.has(k));
  if (!keys.length) return getVideo(id);
  const sql = `UPDATE videos SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map((k) => fields[k] ?? null), id);
  return getVideo(id);
}

export function deleteVideo(id) {
  db.prepare('DELETE FROM videos WHERE id = ?').run(id);
}
