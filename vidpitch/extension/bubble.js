// The camera bubble's picture. Runs as an extension page inside the bubble
// on the recorded page, so the screen capture records it, like Loom's.
(() => {
  const video = document.getElementById('v');
  const msg = document.getElementById('msg');
  let stream = null;
  let camId = '';
  let attempt = 0;

  async function start() {
    const mine = ++attempt; // only the newest request may win
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: camId ? { exact: camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      });
      if (mine !== attempt) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      video.srcObject = s;
    } catch {
      if (mine === attempt) msg.hidden = false;
    }
  }

  video.addEventListener('playing', () => { msg.hidden = true; });

  chrome.storage.local.get(['camId', 'flipCam']).then((p) => {
    camId = p.camId || '';
    document.body.classList.toggle('unflipped', !!p.flipCam);
    start();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.flipCam) document.body.classList.toggle('unflipped', !!changes.flipCam.newValue);
    if (changes.camId && (changes.camId.newValue || '') !== camId) { camId = changes.camId.newValue || ''; start(); }
  });

  addEventListener('pagehide', () => stream?.getTracks().forEach((t) => t.stop()));
})();
