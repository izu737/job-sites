// Clicking the toolbar icon opens the recorder in its own tab. A dedicated
// tab is the dependable way to call getDisplayMedia under Manifest V3, and
// it keeps recording while you work in other tabs.
const RECORDER_URL = chrome.runtime.getURL('recorder.html');

async function openRecorder() {
  const [existing] = await chrome.tabs.query({ url: RECORDER_URL });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: RECORDER_URL });
  }
}

chrome.action.onClicked.addListener(openRecorder);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') openRecorder();
});

// Gmail asks for a video's email block when you paste its link. The token
// stays here in the extension and is never handed to the Gmail page.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'vidpitch:lookup') return;
  (async () => {
    const { serverUrl, token } = await chrome.storage.local.get(['serverUrl', 'token']);
    if (!serverUrl || !token) return reply({ ok: false, error: 'not-connected' });
    try {
      const res = await fetch(`${serverUrl}/api/videos/${encodeURIComponent(msg.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return reply({ ok: false, error: `status-${res.status}` });
      const video = await res.json();
      reply({ ok: true, emailHtml: video.emailHtml });
    } catch (err) {
      reply({ ok: false, error: String(err) });
    }
  })();
  return true; // keep the channel open for the async reply
});
