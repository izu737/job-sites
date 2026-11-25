import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config, cleanUrl } from './config.js';
import * as db from './db.js';
import * as media from './media.js';
import { serialize, sharePage, messagePage } from './views.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const ID_RE = /^[A-Za-z0-9]{12}$/;
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function newId() {
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}
const videoDir = (id) => path.join(config.videosDir, id);

// ---------- background transcoding, one job at a time ----------
let queue = Promise.resolve();
function enqueueTranscode(id) {
  queue = queue.then(async () => {
    const video = db.getVideo(id);
    if (!video) return;
    const dir = videoDir(id);
    const src = path.join(dir, `source.${video.source_ext}`);
    try {
      const info = await media.transcodeToMp4(src, path.join(dir, 'video.mp4'));
      db.updateVideo(id, {
        has_mp4: 1,
        status: 'ready',
        duration: info.duration ?? video.duration,
        width: info.width,
        height: info.height,
      });
      fs.rmSync(src, { force: true });
      console.log(`[video ${id}] ready (${info.duration?.toFixed(1)}s)`);
    } catch (err) {
      // The original WebM still plays in Chrome, so the link keeps working.
      db.updateVideo(id, { status: 'ready', error: `MP4 conversion failed: ${err.message}` });
      console.error(`[video ${id}] transcode failed`, err.message);
    }
  });
  return queue;
}

// ---------- API (used by the Chrome extension) ----------
const api = express.Router();

api.use((req, res, next) => {
  // Auth is a bearer token, never a cookie, so allowing any origin is safe.
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

api.use((req, res, next) => {
  const header = req.get('authorization') || '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7).trim() : '');
  const want = Buffer.from(config.apiToken);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return res.status(401).json({ error: 'Wrong or missing API token. Check the token in the extension settings.' });
  }
  next();
});

api.get('/me', (req, res) => {
  res.json({ ownerName: config.ownerName, bookingUrl: config.bookingUrl, ctaLabel: config.ctaLabel, publicUrl: config.publicUrl });
});

api.get('/videos', (req, res) => {
  res.json({ videos: db.listVideos(50).map(serialize) });
});

api.get('/videos/:id', (req, res) => {
  const video = ID_RE.test(req.params.id) && db.getVideo(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  res.json(serialize(video));
});

api.patch('/videos/:id', express.json({ limit: '10kb' }), (req, res) => {
  const video = ID_RE.test(req.params.id) && db.getVideo(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  const fields = {};
  if (typeof req.body.title === 'string' && req.body.title.trim()) fields.title = req.body.title.trim().slice(0, 200);
  if (typeof req.body.ctaUrl === 'string') fields.cta_url = cleanUrl(req.body.ctaUrl) || null;
  if (typeof req.body.ctaLabel === 'string') fields.cta_label = req.body.ctaLabel.trim().slice(0, 60) || null;
  res.json(serialize(db.updateVideo(video.id, fields)));
});

api.delete('/videos/:id', (req, res) => {
  const video = ID_RE.test(req.params.id) && db.getVideo(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  db.deleteVideo(video.id);
  fs.rmSync(videoDir(video.id), { recursive: true, force: true });
  res.status(204).end();
});

/**
 * Upload: the raw recording is the request body.
 * Query: title, duration (seconds, from the recorder), ctaUrl, ctaLabel.
 * Responds once the GIF and posters exist; MP4 conversion continues after.
 */
api.post('/videos', async (req, res) => {
  const type = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/x-matroska': 'mkv' }[type];
  if (!ext) return res.status(415).json({ error: `Unsupported video type "${type}". Send video/webm or video/mp4.` });

  const id = newId();
  const dir = videoDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, `source.${ext}`);

  let bytes = 0;
  const limit = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (bytes > config.maxUploadBytes) return cb(new Error('too-large'));
      cb(null, chunk);
    },
  });

  try {
    await pipeline(req, limit, fs.createWriteStream(src));
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    if (err.message === 'too-large') return res.status(413).json({ error: 'Video is larger than the upload limit.' });
    return res.status(400).json({ error: 'Upload was interrupted.' });
  }
  if (bytes === 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    return res.status(400).json({ error: 'The upload was empty.' });
  }

  const q = req.query;
  const duration = parseFloat(q.duration);
  const title = (typeof q.title === 'string' && q.title.trim()) ||
    `Video from ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  let video = db.createVideo({
    id,
    title: title.slice(0, 200),
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    sourceExt: ext,
    ctaUrl: typeof q.ctaUrl === 'string' ? cleanUrl(q.ctaUrl) : '',
    ctaLabel: typeof q.ctaLabel === 'string' ? q.ctaLabel.trim().slice(0, 60) : '',
  });

  try {
    const started = Date.now();
    const gif = await media.makePreviewGif(src, path.join(dir, 'preview.gif'));
    await media.makeStills(src, dir);
    video = db.updateVideo(id, { gif_width: gif.width });
    console.log(`[video ${id}] uploaded ${(bytes / 1e6).toFixed(1)} MB, gif ${gif.width}px ${(gif.bytes / 1024).toFixed(0)} KB in ${Date.now() - started} ms`);
  } catch (err) {
    console.error(`[video ${id}] preview failed`, err.message);
    db.deleteVideo(id);
    fs.rmSync(dir, { recursive: true, force: true });
    return res.status(422).json({ error: 'Could not read this recording. It may be empty or corrupted.' });
  }

  enqueueTranscode(id);
  res.status(201).json(serialize(video));
});

app.use('/api', api);

// ---------- public pages and files ----------
app.use('/static', express.static(path.join(here, '..', 'public'), { maxAge: '10m' }));

app.use('/media', express.static(config.videosDir, {
  index: false,
  dotfiles: 'deny',
  setHeaders(res, file) {
    // Video ids never get reused, so these files never change.
    if (!file.endsWith('.part.mp4')) res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

app.get('/v/:id', (req, res) => {
  const video = ID_RE.test(req.params.id) && db.getVideo(req.params.id);
  if (!video) {
    const m = messagePage('Video not found', 'This link may be wrong, or the video was deleted.');
    return res.status(m.status).type('html').send(m.html);
  }
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(sharePage(video));
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => {
  const m = messagePage('Vidpitch', 'Videos live at their own links. Nothing to see here.', 200);
  res.status(200).type('html').send(m.html);
});

// Finish anything that was mid conversion when the server last stopped.
for (const video of db.listProcessing()) {
  if (fs.existsSync(path.join(videoDir(video.id), `source.${video.source_ext}`))) enqueueTranscode(video.id);
}

app.listen(config.port, () => {
  console.log(`Vidpitch server on ${config.publicUrl} (port ${config.port})`);
  if (!process.env.API_TOKEN) console.log(`API token (paste into the extension): ${config.apiToken}`);
  if (!config.bookingUrl) console.log('Warning: BOOKING_URL is not set, so videos will have no booking button.');
});
