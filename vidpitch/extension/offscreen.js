// The recorder engine. Runs in a hidden offscreen document so the
// recording keeps going while you switch tabs.
import { startPreviewCapture } from './preview.js';
import { toUniversalMp4 } from './convert.js';
import { saveFailed } from './failed-store.js';

const PART_SIZE = 20 * 1024 * 1024; // the free Worker plan accepts up to 100 MB per request

const S = {
  streams: [], audioCtx: null, videoTrack: null, audioTracks: [],
  recorder: null, chunks: [], mime: '', preview: null,
  title: '', startedAt: 0, pausedAt: 0, pausedTotal: 0,
  blob: null, final: null, duration: 0,
};

const send = (type, data = {}) => chrome.runtime.sendMessage({ type, ...data }).catch(() => {});
const progress = (stage, pct = 0) => send('vp:progress', { progress: { stage, pct } });

function pickMimeType() {
  return [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4;codecs=avc1,opus',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function stopStreams() {
  S.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  S.streams = [];
  if (S.audioCtx) S.audioCtx.close().catch(() => {});
  S.audioCtx = null;
  S.videoTrack = null;
  S.audioTracks = [];
}

// ---------- prepare: grab every stream before the countdown ----------
async function prepare(msg) {
  stopStreams();
  S.title = msg.title;
  // Offscreen documents can only use chrome.runtime, not chrome.storage,
  // so the background hands over where to upload.
  S.serverUrl = msg.serverUrl;
  S.token = msg.token;
  const cap = { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 };
  let screen;
  if (msg.mode === 'tab') {
    const video = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId, ...cap } };
    const audio = msg.noTabAudio ? false : { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } };
    screen = await navigator.mediaDevices.getUserMedia({ video, audio });
  } else if (msg.mode === 'window' || msg.mode === 'screen') {
    screen = await navigator.mediaDevices.getUserMedia({
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: msg.streamId, ...cap } },
      audio: msg.desktopAudio ? { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: msg.streamId } } : false,
    });
  } else {
    screen = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: msg.camId ? { exact: msg.camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  }
  S.streams.push(screen);

  let mic = null;
  if (msg.mic) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: msg.micId ? { exact: msg.micId } : undefined, echoCancellation: true, noiseSuppression: true },
      });
      S.streams.push(mic);
    } catch { /* recorded without voice; the panel already showed mic state */ }
  }

  S.videoTrack = screen.getVideoTracks()[0];
  S.videoTrack.addEventListener('ended', () => send('vp:track-ended')); // Chrome's "Stop sharing"

  const sources = [screen, mic].filter((s) => s && s.getAudioTracks().length);
  if (sources.length) {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    sources.forEach((s) => ctx.createMediaStreamSource(s).connect(dest));
    // Capturing a tab mutes it for you; play its sound back so you can hear it.
    if (msg.mode === 'tab' && screen.getAudioTracks().length) ctx.createMediaStreamSource(screen).connect(ctx.destination);
    S.audioCtx = ctx;
    S.audioTracks = dest.stream.getAudioTracks();
  }
  S.mime = pickMimeType();
  return { ok: true };
}

// ---------- begin: called the instant the countdown leaves the screen ----------
function begin() {
  S.chunks = [];
  const recorder = new MediaRecorder(new MediaStream([S.videoTrack, ...S.audioTracks]), {
    mimeType: S.mime || undefined,
    videoBitsPerSecond: 2_500_000,
  });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) S.chunks.push(e.data); };
  recorder.start(1000);
  S.recorder = recorder;
  S.preview = startPreviewCapture(S.videoTrack);
  S.preview.catch(() => {});
  S.startedAt = Date.now();
  S.pausedTotal = 0;
  S.pausedAt = 0;
  return { ok: true, startedAt: S.startedAt };
}

function elapsed() {
  const end = S.pausedAt || Date.now();
  return (end - S.startedAt - S.pausedTotal) / 1000;
}

function stopRecorder() {
  return new Promise((resolve) => {
    const r = S.recorder;
    if (!r || r.state === 'inactive') return resolve();
    r.onstop = () => resolve();
    r.stop();
  });
}

async function stop() {
  if (!S.recorder || S.recorder.state === 'inactive') {
    stopStreams();
    return { ok: false, error: 'Stopped before the recording started.' };
  }
  S.duration = elapsed();
  S.recordedMime = S.recorder.mimeType || S.mime;
  await stopRecorder();
  stopStreams();
  S.blob = new Blob(S.chunks, { type: (S.mime || 'video/webm').split(';')[0] });
  S.chunks = [];
  S.final = null;
  if (!S.blob.size || S.duration < 0.5) return { ok: false, error: 'That recording was empty.' };
  process();
  return { ok: true };
}

// ---------- after stopping: Safari proof MP4, then upload ----------
function putWithProgress(url, token, body, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded); };
    xhr.onload = () => {
      let res = null;
      try { res = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(res);
      else reject(new Error(res?.error || `Server answered ${xhr.status}.`));
    };
    xhr.onerror = () => reject(new Error('Network error. Check your connection.'));
    xhr.send(body);
  });
}

async function api(serverUrl, token, path, body) {
  const res = await fetch(serverUrl + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Server answered ${res.status}`);
  return data;
}

async function process() {
  const { serverUrl, token } = S;
  let created = null;
  try {
    if (!serverUrl || !token) throw new Error('Vidpitch is not connected. Open Settings in the recorder.');
    if (!S.final) {
      progress('Making it play on every device', 0);
      const result = await toUniversalMp4(S.blob, S.recordedMime, {
        duration: S.duration,
        onProgress: (f) => progress('Making it play on every device', Math.round(f * 100)),
      });
      S.final = result.blob;
    }
    const previews = await S.preview;
    created = await api(serverUrl, token, '/api/videos', {
      title: S.title, duration: Number(S.duration.toFixed(2)), videoType: S.final.type, gifWidth: previews.gifWidth,
    });
    const base = `${serverUrl}/api/videos/${created.id}`;
    progress('Uploading', 0);
    await Promise.all([
      putWithProgress(`${base}/files/preview.gif`, token, previews.gif, 'image/gif'),
      putWithProgress(`${base}/files/poster.jpg`, token, previews.poster, 'image/jpeg'),
      putWithProgress(`${base}/files/og.jpg`, token, previews.og, 'image/jpeg'),
    ]);
    const total = S.final.size;
    const parts = [];
    let sent = 0;
    for (let n = 1, offset = 0; offset < total; n++, offset += PART_SIZE) {
      const chunk = S.final.slice(offset, Math.min(offset + PART_SIZE, total));
      const part = await putWithProgress(`${base}/parts/${n}?uploadId=${encodeURIComponent(created.uploadId)}`, token, chunk, 'application/octet-stream',
        (loaded) => progress('Uploading', Math.round(((sent + loaded) / total) * 100)));
      parts.push({ partNumber: part.partNumber, etag: part.etag });
      sent += chunk.size;
    }
    progress('Finishing', 100);
    const video = await api(serverUrl, token, `/api/videos/${created.id}/complete`, { uploadId: created.uploadId, parts });
    send('vp:uploaded', { video });
  } catch (err) {
    if (created) api(serverUrl, token, `/api/videos/${created.id}/abort`, { uploadId: created.uploadId }).catch(() => {});
    await saveFailed(S.final || S.blob, S.title).catch(() => {});
    send('vp:failed', { error: err.message });
  }
}

// ---------- messages from the background ----------
const handlers = {
  prepare,
  begin: async () => begin(),
  pause: async () => { if (S.recorder?.state === 'recording') { S.recorder.pause(); S.pausedAt = Date.now(); } return { ok: true }; },
  resume: async () => {
    if (S.recorder?.state === 'paused') { S.recorder.resume(); S.pausedTotal += Date.now() - S.pausedAt; S.pausedAt = 0; }
    return { ok: true };
  },
  restart: async () => { // throw away what was recorded, keep the streams, count down again
    if (S.recorder) { S.recorder.ondataavailable = null; await stopRecorder(); }
    S.recorder = null;
    S.chunks = [];
    return { ok: true };
  },
  cancel: async () => {
    if (S.recorder) { S.recorder.ondataavailable = null; await stopRecorder(); }
    S.recorder = null;
    S.chunks = [];
    stopStreams();
    return { ok: true };
  },
  stop,
  retry: async () => { process(); return { ok: true }; },
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== 'offscreen') return;
  const fn = handlers[msg.type];
  if (!fn) return;
  fn(msg).then(reply, (err) => reply({ ok: false, error: err.message || String(err) }));
  return true;
});
