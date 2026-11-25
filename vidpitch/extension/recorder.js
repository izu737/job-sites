(() => {
  const $ = (sel) => document.querySelector(sel);
  const views = document.querySelectorAll('[data-view]');
  const state = {
    serverUrl: '',
    token: '',
    me: null,
    recorder: null,
    streams: [],
    audioCtx: null,
    chunks: [],
    mimeType: '',
    startedAt: 0,
    pausedAt: 0,
    pausedTotal: 0,
    timerId: null,
    discard: false,
    blob: null,
    duration: 0,
    meta: null,
    video: null,
    camStream: null,
    compositor: null,
    camPosition: 'left',
    camSize: 'medium',
  };

  // ---------- small helpers ----------
  function show(name) {
    views.forEach((v) => { v.hidden = v.dataset.view !== name; });
    $('#open-settings').hidden = name === 'setup' || !state.token;
    document.title = name === 'recording' ? '● Recording | Vidpitch' : 'Vidpitch Recorder';
  }

  let toastTimer;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function setError(id, text) {
    const el = $(id);
    el.textContent = text || '';
    el.hidden = !text;
  }

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
  };

  async function api(path, opts = {}) {
    const res = await fetch(state.serverUrl + path, {
      ...opts,
      headers: { Authorization: `Bearer ${state.token}`, ...(opts.headers || {}) },
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `Server answered ${res.status}`);
    return body;
  }

  // ---------- setup ----------
  async function loadSettings() {
    const saved = await chrome.storage.local.get(['serverUrl', 'token']);
    state.serverUrl = saved.serverUrl || '';
    state.token = saved.token || '';
    $('#server-url').value = state.serverUrl;
    $('#api-token').value = state.token;
  }

  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('#setup-error', '');
    const serverUrl = $('#server-url').value.trim().replace(/\/+$/, '');
    const token = $('#api-token').value.trim();
    const prev = { serverUrl: state.serverUrl, token: state.token };
    Object.assign(state, { serverUrl, token });
    try {
      state.me = await api('/api/me');
    } catch (err) {
      Object.assign(state, prev);
      setError('#setup-error', /fetch/i.test(err.message) ? `Could not reach ${serverUrl}. Check the address and that the server is running.` : err.message);
      return;
    }
    await chrome.storage.local.set({ serverUrl, token, publicUrl: state.me.publicUrl || serverUrl });
    toast(`Connected as ${state.me.ownerName}`);
    goReady();
  });

  $('#open-settings').addEventListener('click', () => {
    $('#setup-cancel').hidden = false;
    show('setup');
  });
  $('#setup-cancel').addEventListener('click', goReady);

  function goReady() {
    const me = state.me;
    $('#ready-sub').textContent = me && !me.bookingUrl
      ? 'Heads up: no booking link is set on the server, so the video will have no booking button.'
      : 'Pick a tab, window or your whole screen in the next step.';
    if (me?.ctaLabel) $('#cta-label').placeholder = me.ctaLabel;
    setError('#ready-error', '');
    show('ready');
    loadRecent();
    syncCamera();
  }

  // ---------- face bubble ----------
  async function loadCamPrefs() {
    const p = await chrome.storage.local.get(['camOn', 'camPosition', 'camSize']);
    if (p.camOn === false) $('#cam').checked = false;
    if (p.camPosition) state.camPosition = p.camPosition;
    if (p.camSize) state.camSize = p.camSize;
    document.querySelectorAll('[data-pos]').forEach((b) => b.classList.toggle('on', b.dataset.pos === state.camPosition));
    document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === state.camSize));
  }

  async function syncCamera() {
    const want = $('#cam').checked && window.VidpitchCamera?.supported;
    $('.cam-controls').classList.toggle('off', !want);
    if (want && !state.camStream) {
      try {
        state.camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' },
        });
        $('#cam-video').srcObject = state.camStream;
        $('#cam-preview').dataset.on = 'true';
      } catch {
        $('#cam').checked = false;
        $('.cam-controls').classList.add('off');
        toast('Camera is blocked or missing. Allow it in the address bar to show your face.');
      }
    } else if (!want && state.camStream) {
      stopCamera();
    }
  }

  function stopCamera() {
    if (state.camStream) state.camStream.getTracks().forEach((t) => t.stop());
    state.camStream = null;
    $('#cam-video').srcObject = null;
    $('#cam-preview').dataset.on = 'false';
  }

  $('#cam').addEventListener('change', () => {
    chrome.storage.local.set({ camOn: $('#cam').checked });
    syncCamera();
  });
  document.querySelectorAll('[data-pos]').forEach((b) => b.addEventListener('click', () => {
    state.camPosition = b.dataset.pos;
    chrome.storage.local.set({ camPosition: state.camPosition });
    document.querySelectorAll('[data-pos]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
    state.camSize = b.dataset.size;
    chrome.storage.local.set({ camSize: state.camSize });
    document.querySelectorAll('[data-size]').forEach((x) => x.classList.toggle('on', x === b));
  }));

  // ---------- recording ----------
  function pickMimeType() {
    // MP4 first: Safari and iPhones play it and nothing needs converting.
    // AAC audio (Chrome on Mac and Windows) is the most compatible.
    const options = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4;codecs=avc1,opus',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return options.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  function cleanupStreams() {
    if (state.compositor) state.compositor.stop();
    state.compositor = null;
    stopCamera(); // turn the camera light off until the next recording
    state.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    state.streams = [];
    if (state.audioCtx) state.audioCtx.close().catch(() => {});
    state.audioCtx = null;
  }

  async function startRecording() {
    setError('#ready-error', '');
    state.meta = {
      title: $('#title').value.trim(),
      ctaUrl: $('#cta-url').value.trim(),
      ctaLabel: $('#cta-label').value.trim(),
    };

    let display;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true, // tab or system sound when Chrome offers it
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include',
      });
    } catch (err) {
      if (err.name !== 'NotAllowedError') setError('#ready-error', `Could not start screen capture: ${err.message}`);
      return;
    }
    state.streams.push(display);
    // Cap at 1080p: Retina screens capture far larger, which bloats files
    // and is harder for phones to play.
    try {
      await display.getVideoTracks()[0].applyConstraints({ width: { max: 1920 }, height: { max: 1080 } });
    } catch { /* keep the original size */ }

    let mic = null;
    if ($('#mic').checked) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        state.streams.push(mic);
      } catch {
        toast('Microphone is blocked, so this video will have no voice. Allow it in the address bar to fix.');
      }
    }

    // Mix screen sound and microphone into one audio track.
    const audioSources = [display, mic].filter((s) => s && s.getAudioTracks().length);
    let tracks = [...display.getVideoTracks()];
    if ($('#cam').checked && state.camStream && window.VidpitchCamera?.supported) {
      state.compositor = window.VidpitchCamera.composite(display, state.camStream, {
        position: state.camPosition,
        size: state.camSize,
      });
      tracks = [state.compositor.track];
    }
    if (audioSources.length) {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      audioSources.forEach((s) => ctx.createMediaStreamSource(s).connect(dest));
      state.audioCtx = ctx;
      tracks.push(...dest.stream.getAudioTracks());
    }

    state.mimeType = pickMimeType();
    state.chunks = [];
    state.discard = false;
    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: state.mimeType || undefined,
      videoBitsPerSecond: 3_000_000,
    });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) state.chunks.push(e.data); };
    recorder.onstop = onRecorderStop;
    state.recorder = recorder;

    // Chrome's own "Stop sharing" button ends the video track.
    display.getVideoTracks()[0].addEventListener('ended', stopRecording);

    recorder.start(1000);
    // Build the email GIF and preview images from the same video, live.
    state.preview = window.VidpitchPreview
      ? window.VidpitchPreview.startPreviewCapture(tracks[0])
      : Promise.reject(new Error('Preview builder did not load.'));
    state.preview.catch(() => {}); // handled after recording stops
    state.startedAt = performance.now();
    state.pausedTotal = 0;
    state.pausedAt = 0;
    $('#pause').textContent = 'Pause';
    $('#live-label').textContent = 'Recording';
    $('.live').classList.remove('paused');
    $('#timer').textContent = '0:00';
    state.timerId = setInterval(tick, 250);
    show('recording');
  }

  function elapsed() {
    const now = state.pausedAt || performance.now();
    return (now - state.startedAt - state.pausedTotal) / 1000;
  }
  function tick() { $('#timer').textContent = fmt(elapsed()); }

  function togglePause() {
    const r = state.recorder;
    if (!r) return;
    if (r.state === 'recording') {
      r.pause();
      state.pausedAt = performance.now();
      $('#pause').textContent = 'Resume';
      $('#live-label').textContent = 'Paused';
      $('.live').classList.add('paused');
    } else if (r.state === 'paused') {
      r.resume();
      state.pausedTotal += performance.now() - state.pausedAt;
      state.pausedAt = 0;
      $('#pause').textContent = 'Pause';
      $('#live-label').textContent = 'Recording';
      $('.live').classList.remove('paused');
    }
  }

  function stopRecording() {
    const r = state.recorder;
    if (!r || r.state === 'inactive') return;
    state.duration = elapsed();
    state.recordedMime = r.mimeType || state.mimeType; // what Chrome actually used
    r.stop();
  }

  async function onRecorderStop() {
    clearInterval(state.timerId);
    cleanupStreams();
    state.recorder = null;

    // Bring this tab back so you can watch the upload.
    try {
      const tab = await chrome.tabs.getCurrent();
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch { /* not fatal */ }

    if (state.discard) {
      state.chunks = [];
      toast('Recording discarded.');
      goReady();
      return;
    }
    const type = (state.mimeType || 'video/webm').split(';')[0];
    state.blob = new Blob(state.chunks, { type });
    state.recordedMime = state.recordedMime || state.mimeType || type;
    state.finalBlob = null;
    state.chunks = [];
    if (state.blob.size === 0 || state.duration < 0.5) {
      setError('#ready-error', 'That recording was empty. Try again.');
      goReady();
      return;
    }
    upload();
  }

  $('#start').addEventListener('click', startRecording);
  $('#pause').addEventListener('click', togglePause);
  $('#stop').addEventListener('click', stopRecording);
  $('#discard').addEventListener('click', () => {
    if (!confirm('Throw away this recording?')) return;
    state.discard = true;
    stopRecording();
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.recorder || $('[data-view="uploading"]').hidden === false) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- upload ----------
  const PART_SIZE = 20 * 1024 * 1024; // the free Worker plan accepts up to 100 MB per request

  function putWithProgress(url, body, contentType, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
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

  async function upload() {
    show('uploading');
    $('#upload-title').textContent = 'Preparing your email preview';
    $('#upload-sub').textContent = 'Keep this tab open.';
    $('#upload-bar').style.width = '0%';
    setError('#upload-error', '');
    $('#upload-actions').hidden = true;

    let created = null;
    try {
      // Standard MP4 with AAC audio so Safari and iPhones can play it.
      if (!state.finalBlob) {
        $('#upload-title').textContent = 'Preparing video for every device';
        $('#upload-sub').textContent = 'Making sure it plays on iPhone and Safari too.';
        try {
          state.finalBlob = await window.VidpitchConvert.toUniversalMp4(state.blob, state.recordedMime, {
            duration: state.duration,
            onProgress: (f) => { $('#upload-bar').style.width = Math.round(f * 100) + '%'; },
            onStage: (stage) => {
              if (stage === 'full') $('#upload-sub').textContent = 'Re-encoding so it plays everywhere. Longer videos take a few minutes.';
            },
          });
        } catch (err) {
          // Never upload a file that would not play on iPhone or Safari.
          console.error('MP4 conversion failed', err);
          uploadFailed('This recording could not be made iPhone and Safari compatible, so it was not uploaded. Save it to your computer, or try again.');
          return;
        }
        $('#upload-bar').style.width = '0%';
        $('#upload-sub').textContent = 'Keep this tab open.';
      }
      const file = state.finalBlob;
      const previews = await state.preview;
      created = await api('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.meta.title,
          duration: Number(state.duration.toFixed(2)),
          ctaUrl: state.meta.ctaUrl,
          ctaLabel: state.meta.ctaLabel,
          videoType: file.type,
          gifWidth: previews.gifWidth,
        }),
      });
      const base = `${state.serverUrl}/api/videos/${created.id}`;
      await Promise.all([
        putWithProgress(`${base}/files/preview.gif`, previews.gif, 'image/gif'),
        putWithProgress(`${base}/files/poster.jpg`, previews.poster, 'image/jpeg'),
        putWithProgress(`${base}/files/og.jpg`, previews.og, 'image/jpeg'),
      ]);

      $('#upload-title').textContent = 'Uploading';
      const total = file.size;
      const parts = [];
      let sent = 0;
      for (let n = 1, offset = 0; offset < total; n++, offset += PART_SIZE) {
        const chunk = file.slice(offset, Math.min(offset + PART_SIZE, total));
        const part = await putWithProgress(
          `${base}/parts/${n}?uploadId=${encodeURIComponent(created.uploadId)}`, chunk, 'application/octet-stream',
          (loaded) => { $('#upload-bar').style.width = Math.round(((sent + loaded) / total) * 100) + '%'; },
        );
        parts.push({ partNumber: part.partNumber, etag: part.etag });
        sent += chunk.size;
      }
      $('#upload-title').textContent = 'Finishing';
      const video = await api(`/api/videos/${created.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: created.uploadId, parts }),
      });
      state.blob = null;
      state.finalBlob = null;
      state.preview = null;
      showDone(video);
    } catch (err) {
      if (created) {
        // Clean up the half finished video so it does not sit in storage.
        api(`/api/videos/${created.id}/abort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId: created.uploadId }),
        }).catch(() => {});
      }
      uploadFailed(err.message);
    }
  }

  function uploadFailed(message) {
    $('#upload-title').textContent = 'Upload failed';
    $('#upload-sub').textContent = 'Your recording is still here. Nothing is lost yet.';
    setError('#upload-error', message);
    $('#upload-actions').hidden = false;
  }

  $('#retry').addEventListener('click', upload);
  $('#save-local').addEventListener('click', () => {
    const a = document.createElement('a');
    const blob = state.finalBlob || state.blob;
    a.href = URL.createObjectURL(blob);
    a.download = `${state.meta.title || 'recording'}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  });

  // ---------- done: share it ----------
  function showDone(video) {
    state.video = video;
    $('#done-title').textContent = video.title;
    $('#done-gif').src = video.gifUrl;
    $('#done-preview-link').href = video.shareUrl;
    $('#share-url').value = video.shareUrl;
    $('#open-page').href = video.shareUrl;
    $('#title').value = '';
    $('#cta-url').value = '';
    $('#cta-label').value = '';
    show('done');
    loadRecent();
  }

  async function copyRich(video) {
    // Rich HTML for email apps, plain link for everywhere else.
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([video.emailHtml], { type: 'text/html' }),
        'text/plain': new Blob([video.emailText], { type: 'text/plain' }),
      }),
    ]);
  }

  async function copyLink(video) {
    await navigator.clipboard.writeText(video.shareUrl);
    toast('Link copied');
  }

  async function insertIntoGmail(video) {
    // Copy first while this tab still has focus, so pasting is the backup.
    try { await copyRich(video); } catch { /* the insert may still work */ }

    const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' });
    if (!tabs.length) {
      toast('Open Gmail and start a new email. The video is copied, so just paste it in.');
      return;
    }
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });

    const message = { type: 'vidpitch:insert', html: video.emailHtml };
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Gmail was open before the extension was installed: add the script now.
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['gmail.js'] });
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        toast('Could not reach Gmail. Reload the Gmail tab, or paste with Ctrl+V or Cmd+V.');
      }
    }
  }

  $('#insert-gmail').addEventListener('click', () => insertIntoGmail(state.video));
  $('#copy-email').addEventListener('click', async () => {
    try { await copyRich(state.video); toast('Copied. Paste it into any email.'); }
    catch (err) { toast(`Could not copy: ${err.message}`); }
  });
  document.querySelector('[data-copy-link]').addEventListener('click', () => copyLink(state.video));
  $('#new-recording').addEventListener('click', goReady);

  // ---------- recent videos ----------
  async function loadRecent() {
    let videos = [];
    try { videos = (await api('/api/videos')).videos.slice(0, 8); } catch { return; }
    const list = $('#recent-list');
    list.replaceChildren();
    for (const v of videos) {
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.src = v.posterUrl;
      img.alt = '';
      img.loading = 'lazy';
      const body = document.createElement('div');
      body.className = 'r-body';
      const title = document.createElement('a');
      title.className = 'r-title';
      title.href = v.shareUrl;
      title.target = '_blank';
      title.rel = 'noopener';
      title.textContent = v.title;
      const actions = document.createElement('div');
      actions.className = 'r-actions';
      const mk = (label, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link';
        b.textContent = label;
        b.addEventListener('click', fn);
        return b;
      };
      actions.append(
        mk('Gmail', () => insertIntoGmail(v)),
        mk('Copy email', async () => { try { await copyRich(v); toast('Copied. Paste it into any email.'); } catch (err) { toast(err.message); } }),
        mk('Link', () => copyLink(v)),
      );
      body.append(title, actions);
      li.append(img, body);
      list.append(li);
    }
    $('#recent').hidden = videos.length === 0;
  }

  // ---------- boot ----------
  (async () => {
    await loadSettings();
    await loadCamPrefs();
    if (!state.serverUrl || !state.token) return show('setup');
    try {
      state.me = await api('/api/me');
      await chrome.storage.local.set({ publicUrl: state.me.publicUrl || state.serverUrl });
      goReady();
    } catch (err) {
      setError('#setup-error', `Could not connect: ${err.message}`);
      show('setup');
    }
  })();
})();
