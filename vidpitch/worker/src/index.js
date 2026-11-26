// Vidpitch on Cloudflare.
//   /                   your video library (sign in required)
//   /record             record from the browser (sign in required)
//   /login, /logout     sign in with your access key
//   /v/:id              public share page
//   /media/:id/:file    video, GIF and images from R2 (with seeking support)
//   /app/...            the recorder's files, shared with the extension
//   /api/...            used by the extension (Bearer token) and the website (sign in cookie)
// The extension builds the GIF and images itself, so this Worker only
// stores and serves files. That keeps it inside the free plan.
import { serialize, sharePage, messagePage, emailHtml, emailText } from './views.js';
import { readBoxHeader, verdict } from './mp4check.js';
import shareCss from '../public/static/share.css';
import playerJs from '../public/static/player.js';
import appCss from '../public/static/app.css';
import libraryJs from '../public/static/library.js';
import ownerJs from '../public/static/owner.js';
import { APP_FILES, RECORDER_HTML } from './appfiles.js';
import { loginPage, libraryPage, recordPage } from './library.js';
import { keyMatches, newSessionCookie, clearSessionCookie, hasSession, sameOrigin, safeNext } from './session.js';

const STATIC = {
  'share.css': { body: shareCss, type: 'text/css; charset=utf-8' },
  'player.js': { body: playerJs, type: 'text/javascript; charset=utf-8' },
  'app.css': { body: appCss, type: 'text/css; charset=utf-8' },
  'library.js': { body: libraryJs, type: 'text/javascript; charset=utf-8' },
  'owner.js': { body: ownerJs, type: 'text/javascript; charset=utf-8' },
};

const ID_RE = /^[A-Za-z0-9]{12}$/;
// Link previews and crawlers fetch the page too; they are not views.
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|slack|discord|linkedin|skype|google|bing|yahoo|curl|wget|python|go-http|headless|lighthouse/i;
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const FILES = {
  'preview.gif': 'image/gif',
  'poster.jpg': 'image/jpeg',
  'og.jpg': 'image/jpeg',
};
// The extension always sends MP4 (H.264 + AAC). WebM is still accepted so a
// recording is never lost, even in the rare case the conversion could not run.
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm' };

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

function cleanUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function configFor(env, request) {
  return {
    publicUrl: (env.PUBLIC_URL || new URL(request.url).origin).replace(/\/+$/, ''),
    ownerName: env.OWNER_NAME || 'Your Name',
    bookingUrl: cleanUrl(env.BOOKING_URL),
    ctaLabel: env.CTA_LABEL || 'Book a call',
    ctaHeadline: env.CTA_HEADLINE || 'Want to talk this through?',
    ctaSubtext: env.CTA_SUBTEXT || 'Pick a time that works for you. It takes 10 seconds.',
    ctaLeadSeconds: Number(env.CTA_LEAD_SECONDS || 6),
  };
}

const CORS = {
  // Auth is a bearer token, never a cookie, so allowing any origin is safe.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
const fail = (status, error) => json({ error }, status);

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}

async function authorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Bearer ')) return keyMatches(env, header.slice(7)); // the extension
  // The website: signed in cookie, and changes only from our own pages.
  if (!(await hasSession(request, env))) return false;
  return request.method === 'GET' || sameOrigin(request);
}

function redirect(location, cookie) {
  const headers = { Location: location, 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 303, headers });
}

const getVideo = (env, id) => env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();

// ---------------- media ----------------
/**
 * Reads the stored video's box layout and codecs with small ranged reads
 * (never the whole file) and applies the Safari rules from mp4check.js.
 */
async function checkStoredVideo(env, key) {
  const head = await env.MEDIA.head(key);
  if (!head) return { ok: false, problems: ['video file missing'] };
  const order = [];
  let moov = null;
  let offset = 0;
  while (offset < head.size && order.length < 16 && !order.includes('mdat')) {
    const obj = await env.MEDIA.get(key, { range: { offset, length: 16 } });
    const box = readBoxHeader(new Uint8Array(await obj.arrayBuffer()));
    if (!box || box.size < 8) break;
    order.push(box.type);
    if (box.type === 'moov') {
      if (box.size > 16 * 1024 * 1024) return { ok: false, problems: ['index too large to check'] };
      const m = await env.MEDIA.get(key, { range: { offset, length: box.size } });
      moov = new Uint8Array(await m.arrayBuffer());
    }
    offset += box.size;
  }
  return verdict({ order, moov });
}

async function serveMedia(request, env, id, file) {
  if (!ID_RE.test(id)) return new Response('Not found', { status: 404 });
  return serveObject(request, env, `${id}/${file}`);
}

async function serveObject(request, env, key) {
  const object = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (object === null) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  // Video ids are never reused, so these files never change.
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  if (!('body' in object)) return new Response(null, { status: 304, headers }); // If-None-Match hit
  const range = object.range;
  if (range && request.headers.has('Range')) {
    const offset = range.offset ?? (range.suffix !== undefined ? object.size - range.suffix : 0);
    const length = range.length ?? (range.suffix !== undefined ? range.suffix : object.size - offset);
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
}

// ---------------- API ----------------
async function api(request, env, cfg, parts) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!(await authorized(request, env))) {
    return fail(401, 'Wrong or missing API token. Check the token in the extension settings.');
  }
  const [resource, id, sub, subId] = parts;
  const method = request.method;

  if (resource === 'me' && method === 'GET') {
    return json({ ownerName: cfg.ownerName, bookingUrl: cfg.bookingUrl, ctaLabel: cfg.ctaLabel, publicUrl: cfg.publicUrl });
  }
  if (resource !== 'videos') return fail(404, 'Not found');

  // List
  if (!id && method === 'GET') {
    const { results } = await env.DB.prepare("SELECT * FROM videos WHERE status = 'ready' ORDER BY created_at DESC LIMIT 500").all();
    return json({ videos: results.map((v) => serialize(cfg, v)) });
  }

  // Create: returns the id and a multipart upload for the video file.
  if (!id && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const ext = VIDEO_TYPES[String(body.videoType || '').split(';')[0].trim().toLowerCase()];
    if (!ext) return fail(415, 'Send videoType video/mp4.');
    const vid = newId();
    const duration = Number(body.duration);
    const title = (typeof body.title === 'string' && body.title.trim()) ||
      `Video from ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    await env.DB.prepare(
      'INSERT INTO videos (id, title, created_at, duration, gif_width, video_ext, status, cta_url, cta_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      vid, title.slice(0, 200), new Date().toISOString(),
      Number.isFinite(duration) && duration > 0 ? duration : null,
      Number(body.gifWidth) || 480, ext, 'uploading',
      cleanUrl(body.ctaUrl) || null,
      typeof body.ctaLabel === 'string' && body.ctaLabel.trim() ? body.ctaLabel.trim().slice(0, 60) : null,
    ).run();
    const upload = await env.MEDIA.createMultipartUpload(`${vid}/video.${ext}`, {
      httpMetadata: { contentType: `video/${ext}` },
    });
    return json({ id: vid, uploadId: upload.uploadId }, 201);
  }

  if (!ID_RE.test(id || '')) return fail(404, 'Video not found');
  const video = await getVideo(env, id);
  if (!video) return fail(404, 'Video not found');

  if (!sub && method === 'GET') return json(serialize(cfg, video));

  if (!sub && method === 'PATCH') {
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : video.title;
    const ctaUrl = typeof body.ctaUrl === 'string' ? cleanUrl(body.ctaUrl) || null : video.cta_url;
    const ctaLabel = typeof body.ctaLabel === 'string' ? body.ctaLabel.trim().slice(0, 60) || null : video.cta_label;
    await env.DB.prepare('UPDATE videos SET title = ?, cta_url = ?, cta_label = ? WHERE id = ?').bind(title, ctaUrl, ctaLabel, id).run();
    return json(serialize(cfg, await getVideo(env, id)));
  }

  if (!sub && method === 'DELETE') {
    const listed = await env.MEDIA.list({ prefix: `${id}/` });
    if (listed.objects.length) await env.MEDIA.delete(listed.objects.map((o) => o.key));
    await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204, headers: CORS });
  }

  // GIF, poster and link preview image
  if (sub === 'files' && method === 'PUT') {
    const type = FILES[subId];
    if (!type) return fail(404, 'Unknown file');
    if (!request.body) return fail(400, 'Empty file');
    await env.MEDIA.put(`${id}/${subId}`, request.body, { httpMetadata: { contentType: type } });
    return json({ ok: true });
  }

  // Video in parts: PUT /api/videos/:id/parts/:n?uploadId=...
  const uploadId = new URL(request.url).searchParams.get('uploadId');
  const key = `${id}/video.${video.video_ext}`;
  if (sub === 'parts' && method === 'PUT') {
    const n = Number(subId);
    if (!uploadId || !Number.isInteger(n) || n < 1 || n > 10000) return fail(400, 'Bad part');
    if (!request.body) return fail(400, 'Empty part');
    const part = await env.MEDIA.resumeMultipartUpload(key, uploadId).uploadPart(n, request.body);
    return json(part);
  }

  if (sub === 'complete' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.uploadId || !Array.isArray(body.parts) || !body.parts.length) return fail(400, 'Missing parts');
    await env.MEDIA.resumeMultipartUpload(key, body.uploadId).complete(body.parts);
    // Record whether Safari can play it. Never reject: a video is never lost.
    let check = { ok: false, problems: ['not an MP4'] };
    if (video.video_ext === 'mp4') check = await checkStoredVideo(env, key).catch((e) => ({ ok: false, problems: [String(e)] }));
    if (!check.ok) console.warn(`video ${id} may not play in Safari: ${check.problems.join(', ')}`);
    const missing = [];
    for (const f of Object.keys(FILES)) if (!(await env.MEDIA.head(`${id}/${f}`))) missing.push(f);
    if (missing.length) return fail(400, `Missing ${missing.join(', ')}`);
    await env.DB.prepare("UPDATE videos SET status = 'ready', safari_ready = ?, safari_notes = ? WHERE id = ?")
      .bind(check.ok ? 1 : 0, check.ok ? null : check.problems.join(', ').slice(0, 500), id).run();
    return json(serialize(cfg, await getVideo(env, id)));
  }

  if (sub === 'abort' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (body.uploadId) await env.MEDIA.resumeMultipartUpload(key, body.uploadId).abort().catch(() => {});
    const listed = await env.MEDIA.list({ prefix: `${id}/` });
    if (listed.objects.length) await env.MEDIA.delete(listed.objects.map((o) => o.key));
    await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204, headers: CORS });
  }

  return fail(404, 'Not found');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const cfg = configFor(env, request);

    try {
      if (parts[0] === 'api') return await api(request, env, cfg, parts.slice(1));

      if (parts[0] === 'media' && parts.length === 3 && (request.method === 'GET' || request.method === 'HEAD')) {
        const [, id, file] = parts;
        if (!FILES[file] && !/^video\.(mp4|webm)$/.test(file)) return new Response('Not found', { status: 404 });
        return await serveMedia(request, env, id, file);
      }

      if (parts[0] === 'v' && parts.length === 2) {
        const video = ID_RE.test(parts[1]) && (await getVideo(env, parts[1]));
        if (!video || video.status !== 'ready') {
          const m = messagePage('Video not found', 'This link may be wrong, or the video was deleted.');
          return html(m.html, 404);
        }
        const owner = await hasSession(request, env);
        if (!owner && !BOT_RE.test(request.headers.get('User-Agent') || '')) {
          // A real visitor, not you and not a link preview bot.
          video.views = (video.views || 0) + 1;
          ctx.waitUntil(env.DB.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').bind(video.id).run());
        }
        return html(sharePage(cfg, video, owner
          ? { owner: true, justRecorded: url.searchParams.get('new') === '1', emailHtml: emailHtml(cfg, video), emailText: emailText(cfg, video) }
          : {}));
      }

      // ---- website: library, recorder, sign in ----
      if (!parts.length && request.method === 'GET') {
        if (!(await hasSession(request, env))) return redirect('/login');
        const { results } = await env.DB.prepare("SELECT * FROM videos WHERE status = 'ready' ORDER BY created_at DESC LIMIT 500").all();
        return html(libraryPage(cfg, results));
      }
      if (parts[0] === 'record' && parts.length === 1 && request.method === 'GET') {
        if (!(await hasSession(request, env))) return redirect('/login?next=/record');
        return html(recordPage(RECORDER_HTML));
      }
      if (parts[0] === 'login' && parts.length === 1) {
        const next = safeNext(url.searchParams.get('next'));
        if (request.method === 'GET') {
          if (await hasSession(request, env)) return redirect(next);
          return html(loginPage({ next }));
        }
        if (request.method === 'POST') {
          const form = await request.formData().catch(() => null);
          const target = safeNext(form?.get('next'));
          if (!keyMatches(env, form?.get('key'))) {
            await new Promise((r) => setTimeout(r, 600)); // slow down guessing
            return html(loginPage({ error: 'That access key is not right.', next: target }), 401);
          }
          return redirect(target, await newSessionCookie(env));
        }
      }
      if (parts[0] === 'logout' && parts.length === 1) return redirect('/login', clearSessionCookie());

      // ---- the recorder's files (public: they hold no data) ----
      if (parts[0] === 'app' && parts.length > 1 && (request.method === 'GET' || request.method === 'HEAD')) {
        const path = parts.slice(1).join('/');
        const file = APP_FILES[path];
        if (file) {
          return new Response(file[0], { headers: { 'Content-Type': file[1], 'Cache-Control': 'public, max-age=300' } });
        }
        if (/^vendor\/ffmpeg-core\/ffmpeg-core\.(js|wasm)$/.test(path)) return await serveObject(request, env, `app/${path}`);
        return new Response('Not found', { status: 404 });
      }

      if (parts[0] === 'static' && parts.length === 2 && STATIC[parts[1]]) {
        const f = STATIC[parts[1]];
        return new Response(f.body, { headers: { 'Content-Type': f.type, 'Cache-Control': 'public, max-age=600' } });
      }
      if (parts[0] === 'health') return json({ ok: true });
      return html(messagePage('Not found', 'There is nothing at this address.').html, 404);
    } catch (err) {
      console.error(err);
      return parts[0] === 'api' ? fail(500, 'Server error. Try again.') : new Response('Server error', { status: 500 });
    }
  },
};
