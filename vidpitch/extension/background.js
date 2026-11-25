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
