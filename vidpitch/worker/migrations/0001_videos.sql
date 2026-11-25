CREATE TABLE IF NOT EXISTS videos (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  duration    REAL,
  gif_width   INTEGER,
  video_ext   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'uploading',
  cta_url     TEXT,
  cta_label   TEXT
);
CREATE INDEX IF NOT EXISTS videos_created ON videos (created_at DESC);
