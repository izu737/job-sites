// Vidpitch background coordinator.
//
// The flow mirrors Loom's Chrome extension:
//   1. Click the toolbar icon: a recorder panel and your camera bubble appear
//      on the page you are on (overlay.js).
//   2. Start Recording: Chrome asks for the window or screen (current tab
//      needs no picker), then a 3, 2, 1 countdown plays on that page.
//   3. The recording itself runs in a hidden offscreen document
//      (offscreen.js), so it survives tab switches. The camera bubble is a
//      real element on the page, so the screen capture records it, exactly
//      like Loom's.
//   4. A control bar (stop, timer, pause, restart, cancel) stays on the page
//      and follows you to whichever tab you switch to.
//   5. Stop: the video page opens in a new tab while it uploads.

const RECORDER_URL = chrome.runtime.getURL('recorder.html');
const OFFSCREEN_URL = 'offscreen.html';

let state = { phase: 'idle' };
const ready = chrome.storage.session.get('vpState').then((s) => { if (s.vpState) state = s.vpState; });

async function setState(patch) {
  state = { ...state, ...patch };
  await chrome.storage.session.set({ vpState: state });
  broadcast({ type: 'vp:state', state });
  const badge = { recording: 'REC', paused: '❚❚', countdown: '…' }[state.phase] || '';
  chrome.action.setBadgeText({ text: badge }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: state.phase === 'paused' ? '#6b6e76' : '#e5484d' }).catch(() => {});
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {}); // extension pages (processing page)
  if (state.overlayTabId) chrome.tabs.sendMessage(state.overlayTabId, msg).catch(() => {});
}

const injectable = (url) => /^(https?|file):/.test(url || '') && !/^https:\/\/chromewebstore\.google\.com/.test(url) && !/^https:\/\/chrome\.google\.com\/webstore/.test(url);

async function injectOverlay(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] });
}

async function showOverlay(tabId, msg) {
  await injectOverlay(tabId);
  await chrome.tabs.sendMessage(tabId, msg);
}

async function openRecorderTab() {
  const [existing] = await chrome.tabs.query({ url: RECORDER_URL });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: RECORDER_URL });
  }
}

// ---------- 1. toolbar click / keyboard shortcut ----------
async function onInvoke(tab) {
  await ready;
  if (['recording', 'paused', 'countdown'].includes(state.phase)) {
    // Like Loom: clicking the icon while recording stops it.
    return control('stop');
  }
  const { serverUrl, token } = await chrome.storage.local.get(['serverUrl', 'token']);
  if (!serverUrl || !token || !tab || !injectable(tab.url)) {
    // First run, or a page Chrome does not let extensions touch (chrome://,
    // the Web Store): use the full recorder tab instead.
    return openRecorderTab();
  }
  if (state.overlayTabId && state.overlayTabId !== tab.id) {
    chrome.tabs.sendMessage(state.overlayTabId, { type: 'vp:teardown' }).catch(() => {});
  }
  await setState({ phase: 'idle', overlayTabId: tab.id, recordTabId: tab.id });
  try {
    await showOverlay(tab.id, { type: 'vp:toggle-panel' });
  } catch {
    openRecorderTab();
  }
}

chrome.action.onClicked.addListener(onInvoke);
chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd === 'toggle-recorder') onInvoke(tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]);
});
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') openRecorderTab(); // connect the server once
});

// ---------- offscreen document (the actual recorder) ----------
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA', 'DISPLAY_MEDIA', 'WORKERS'],
    justification: 'Record the screen, camera and microphone, then prepare and upload the video.',
  });
}

async function closeOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) await chrome.offscreen.closeDocument().catch(() => {});
}

function toOffscreen(type, data = {}) {
  return chrome.runtime.sendMessage({ target: 'offscreen', type, ...data });
}

function pickDesktop(kind) {
  const sources = { screen: ['screen', 'audio'], window: ['window'], any: ['tab', 'window', 'screen', 'audio'] }[kind];
  return new Promise((resolve) => {
    // No target tab: the stream is then usable by the extension's own recorder.
    chrome.desktopCapture.chooseDesktopMedia(sources, (streamId, options) => resolve({ streamId, audio: !!options?.canRequestAudioTrack }));
  });
}

function titleFor(tab) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const base = (tab?.title || 'Untitled').replace(/\s+/g, ' ').trim().slice(0, 90);
  return `${base} - ${date}`;
}

// ---------- 2. Start Recording ----------
async function start(tab, opts) {
  await ready;
  const mode = ['tab', 'window', 'screen', 'camera'].includes(opts.mode) ? opts.mode : 'tab';
  let streamId = '';
  let desktopAudio = false;
  let source = mode; // what the recorder actually receives
  if (mode === 'tab') {
    try {
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    } catch {
      // Chrome only allows silent tab capture right after the toolbar click.
      // Fall back to Chrome's picker so recording still starts.
      source = 'any';
    }
  }
  if (source !== 'tab' && source !== 'camera') {
    const picked = await pickDesktop(source);
    if (!picked.streamId) return { ok: false, cancelled: true };
    streamId = picked.streamId;
    desktopAudio = picked.audio;
    source = 'desktop';
  }

  await ensureOffscreen();
  const title = titleFor(tab);
  const { serverUrl, token } = await chrome.storage.local.get(['serverUrl', 'token']);
  let prep = await toOffscreen('prepare', {
    mode: source === 'desktop' ? 'screen' : mode, streamId, desktopAudio,
    mic: opts.mic, micId: opts.micId, camId: opts.camId,
    title, serverUrl, token,
  });
  if (!prep?.ok && source === 'tab') {
    // Usually no audio output to capture (for example no speakers). Each
    // capture id works once, so ask Chrome for a fresh one and record the
    // picture alone (your microphone is still recorded).
    try {
      const retryId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      prep = await toOffscreen('prepare', { mode, streamId: retryId, noTabAudio: true, mic: opts.mic, micId: opts.micId, camId: opts.camId, title, serverUrl, token });
    } catch { /* report the first error below */ }
  }
  if (!prep?.ok) return { ok: false, error: prep?.error || 'Could not start recording.' };

  await setState({ phase: 'countdown', mode, title, recordTabId: tab.id, overlayTabId: tab.id, startedAt: 0, pausedMs: 0, pausedAt: 0 });
  const seconds = opts.countdown === false ? 0 : 3;
  chrome.tabs.sendMessage(tab.id, { type: 'vp:countdown', seconds }).catch(() => begin());
  return { ok: true };
}

// The overlay calls this once the 3, 2, 1 has left the screen.
async function begin() {
  if (state.phase !== 'countdown') return;
  const res = await toOffscreen('begin');
  if (!res?.ok) {
    await teardown();
    return;
  }
  await setState({ phase: 'recording', startedAt: res.startedAt, pausedMs: 0, pausedAt: 0 });
}

// ---------- 3. controls ----------
async function control(action) {
  await ready;
  if (action === 'pause' && state.phase === 'recording') {
    await toOffscreen('pause');
    return setState({ phase: 'paused', pausedAt: Date.now() });
  }
  if (action === 'resume' && state.phase === 'paused') {
    await toOffscreen('resume');
    return setState({ phase: 'recording', pausedMs: state.pausedMs + (Date.now() - state.pausedAt), pausedAt: 0 });
  }
  if (action === 'restart' && ['recording', 'paused'].includes(state.phase)) {
    await toOffscreen('restart');
    await setState({ phase: 'countdown', startedAt: 0, pausedMs: 0, pausedAt: 0 });
    return chrome.tabs.sendMessage(state.overlayTabId, { type: 'vp:countdown', seconds: 3 }).catch(() => begin());
  }
  if (action === 'cancel') {
    await toOffscreen('cancel').catch(() => {});
    await teardown();
    return closeOffscreen();
  }
  if (action === 'stop' && ['recording', 'paused', 'countdown'].includes(state.phase)) {
    const res = await toOffscreen('stop');
    const overlayTab = state.overlayTabId;
    await setState({ phase: 'processing', progress: { stage: 'Preparing your video', pct: 0 }, result: null, error: null });
    if (overlayTab) chrome.tabs.sendMessage(overlayTab, { type: 'vp:teardown' }).catch(() => {});
    const page = await chrome.tabs.create({ url: chrome.runtime.getURL('processing.html') });
    await setState({ processingTabId: page.id, overlayTabId: null });
    if (!res?.ok) await setState({ phase: 'failed', error: res?.error || 'The recording was empty.' });
  }
}

async function teardown() {
  if (state.overlayTabId) chrome.tabs.sendMessage(state.overlayTabId, { type: 'vp:teardown' }).catch(() => {});
  await setState({ phase: 'idle', overlayTabId: null, startedAt: 0 });
}

// ---------- 4. follow the user across tabs while recording ----------
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await ready;
  if (!['recording', 'paused'].includes(state.phase)) return;
  if (state.mode === 'tab') return; // a tab recording only shows its own tab
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !injectable(tab.url) || tabId === state.overlayTabId) return;
  if (state.overlayTabId) chrome.tabs.sendMessage(state.overlayTabId, { type: 'vp:teardown' }).catch(() => {});
  await setState({ overlayTabId: tabId });
  showOverlay(tabId, { type: 'vp:state', state }).catch(() => {});
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  await ready;
  if (info.status !== 'complete' || tabId !== state.overlayTabId) return;
  if (!['recording', 'paused'].includes(state.phase) || !injectable(tab.url)) return;
  showOverlay(tabId, { type: 'vp:state', state }).catch(() => {}); // page navigated: put the controls back
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ready;
  if (tabId === state.recordTabId && state.mode === 'tab' && ['recording', 'paused'].includes(state.phase)) control('stop');
});

// ---------- messages ----------
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target === 'offscreen') return; // not ours
  (async () => {
    await ready;
    switch (msg?.type) {
      case 'vp:start': return reply(await start(sender.tab, msg.opts || {}));
      case 'vp:countdown-done': await begin(); return reply({ ok: true });
      case 'vp:control': await control(msg.action); return reply({ ok: true });
      case 'vp:get-state': return reply({ state });
      case 'vp:panel-close':
        if (sender.tab) chrome.tabs.sendMessage(sender.tab.id, { type: 'vp:teardown' }).catch(() => {});
        if (state.phase === 'idle') await setState({ overlayTabId: null });
        return reply({ ok: true });
      case 'vp:panel-resize':
        if (sender.tab) chrome.tabs.sendMessage(sender.tab.id, msg).catch(() => {});
        return reply({ ok: true });
      case 'vp:open-library': {
        const { serverUrl } = await chrome.storage.local.get('serverUrl');
        if (serverUrl) chrome.tabs.create({ url: serverUrl });
        return reply({ ok: true });
      }
      case 'vp:open-settings': await openRecorderTab(); return reply({ ok: true });
      // from the offscreen recorder
      case 'vp:track-ended': await control('stop'); return reply({ ok: true });
      case 'vp:progress': await setState({ progress: msg.progress }); return reply({ ok: true });
      case 'vp:uploaded':
        await setState({ phase: 'done', result: msg.video, progress: { stage: 'Done', pct: 100 } });
        setTimeout(closeOffscreen, 1500);
        return reply({ ok: true });
      case 'vp:failed': await setState({ phase: 'failed', error: msg.error }); return reply({ ok: true });
      // from the processing page
      case 'vp:retry': await setState({ phase: 'processing', error: null }); toOffscreen('retry'); return reply({ ok: true });
      case 'vp:finish': await setState({ phase: 'idle', result: null, progress: null }); return reply({ ok: true });
      // Gmail asks for a video's email block when you paste its link.
      case 'vidpitch:lookup': return reply(await lookup(msg.id));
      default: return reply(undefined);
    }
  })();
  return true; // async reply
});

async function lookup(id) {
  const { serverUrl, token } = await chrome.storage.local.get(['serverUrl', 'token']);
  if (!serverUrl || !token) return { ok: false, error: 'not-connected' };
  try {
    const res = await fetch(`${serverUrl}/api/videos/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { ok: false, error: `status-${res.status}` };
    return { ok: true, emailHtml: (await res.json()).emailHtml };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
