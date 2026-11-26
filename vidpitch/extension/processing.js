// Shown right after you stop, like Loom opening the video page. Follows the
// upload, then signs you in to your library and lands on the video page.
import { loadFailed, clearFailed } from './failed-store.js';

const $ = (sel) => document.querySelector(sel);
let handedOff = false;

async function handoff(video) {
  if (handedOff) return;
  handedOff = true;
  const { serverUrl, token } = await chrome.storage.local.get(['serverUrl', 'token']);
  chrome.runtime.sendMessage({ type: 'vp:finish' }).catch(() => {});
  clearFailed().catch(() => {});
  // Sign in with the access key so the video page opens in owner mode.
  const form = $('#handoff');
  form.action = `${serverUrl}/login`;
  form.key.value = token;
  form.next.value = `/v/${video.id}?new=1`;
  form.submit();
}

function render(state) {
  if (!state) return;
  if (state.phase === 'done' && state.result) return handoff(state.result);
  const failed = state.phase === 'failed';
  $('#working').hidden = failed;
  $('#failed').hidden = !failed;
  if (failed) {
    $('#error').textContent = state.error || 'Something went wrong.';
    return;
  }
  const p = state.progress || { stage: 'Preparing your video', pct: 0 };
  $('#stage').textContent = p.stage === 'Uploading' ? `Uploading ${p.pct}%` : p.stage;
  $('#bar').style.width = `${p.pct || 0}%`;
}

chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === 'vp:state') render(msg.state); });
chrome.runtime.sendMessage({ type: 'vp:get-state' }).then((r) => render(r?.state)).catch(() => {});

$('#retry').addEventListener('click', () => {
  $('#working').hidden = false;
  $('#failed').hidden = true;
  chrome.runtime.sendMessage({ type: 'vp:retry' });
});

$('#save').addEventListener('click', async () => {
  const rec = await loadFailed().catch(() => null);
  if (!rec?.blob) return alert('The recording is no longer available.');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(rec.blob);
  a.download = `${(rec.title || 'recording').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.${rec.blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

chrome.storage.session.get('vpState').then((s) => { if (s.vpState?.title) $('#title').textContent = s.vpState.title; }).catch(() => {});
