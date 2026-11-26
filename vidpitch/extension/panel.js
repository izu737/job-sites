(() => {
  const $ = (sel) => document.querySelector(sel);
  const MODES = { tab: 'Current tab', window: 'Window', screen: 'Full screen', camera: 'Camera only' };
  const prefs = { mode: 'tab', camOn: true, micOn: true, camId: '', micId: '', countdownOn: true, flipCam: false };
  let micStream = null;
  let audioCtx = null;
  let meterId = null;

  const post = (data) => parent.postMessage({ vp: true, ...data }, '*');
  const send = (msg) => chrome.runtime.sendMessage(msg);

  // Tell the page how tall the panel is, so its frame fits exactly.
  new ResizeObserver(() => post({ kind: 'resize', height: $('#panel').offsetHeight })).observe($('#panel'));

  function setError(text) {
    $('#error').textContent = text || '';
    $('#error').hidden = !text;
  }

  // ---------- menus ----------
  function closeMenus(except) {
    document.querySelectorAll('.menu').forEach((m) => { if (m !== except) m.hidden = true; });
    document.querySelectorAll('[aria-expanded]').forEach((b) => { if (!except || b.nextElementSibling !== except) b.setAttribute('aria-expanded', 'false'); });
  }
  function toggleMenu(btn, menu) {
    const open = menu.hidden;
    closeMenus();
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.row-wrap')) closeMenus(); });

  // ---------- capture source ----------
  function renderSource() {
    $('#source-label').textContent = MODES[prefs.mode];
    $('#source-menu').querySelectorAll('li').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.mode === prefs.mode)));
  }
  $('#source-btn').addEventListener('click', () => toggleMenu($('#source-btn'), $('#source-menu')));
  $('#source-menu').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    prefs.mode = li.dataset.mode;
    chrome.storage.local.set({ mode: prefs.mode });
    renderSource();
    closeMenus();
  });

  // ---------- devices ----------
  async function listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      cams: devices.filter((d) => d.kind === 'videoinput'),
      mics: devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications'),
    };
  }

  const cleanLabel = (label, fallback) => (label || fallback).replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '');

  function fillMenu(menu, list, selectedId, offLabel, onPick) {
    menu.replaceChildren();
    list.forEach((d, i) => {
      const li = document.createElement('li');
      li.textContent = cleanLabel(d.label, `${offLabel.split(' ')[1]} ${i + 1}`);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(d.deviceId === selectedId));
      li.addEventListener('click', () => onPick(d.deviceId));
      menu.append(li);
    });
    const off = document.createElement('li');
    off.textContent = offLabel;
    off.setAttribute('role', 'option');
    off.addEventListener('click', () => onPick(null));
    menu.append(off);
  }

  async function renderDevices() {
    const { cams, mics } = await listDevices();
    const cam = cams.find((d) => d.deviceId === prefs.camId) || cams[0];
    const mic = mics.find((d) => d.deviceId === prefs.micId) || mics.find((d) => d.deviceId === 'default') || mics[0];
    $('#cam-label').textContent = prefs.camOn ? cleanLabel(cam?.label, 'Camera') : 'No camera';
    $('#mic-label').textContent = prefs.micOn ? cleanLabel(mic?.label, 'Microphone') : 'No microphone';
    $('#cam-toggle').textContent = prefs.camOn ? 'On' : 'Off';
    $('#cam-toggle').setAttribute('aria-pressed', String(prefs.camOn));
    $('#mic-toggle').textContent = prefs.micOn ? 'On' : 'Off';
    $('#mic-toggle').setAttribute('aria-pressed', String(prefs.micOn));
    $('.mic-row').classList.toggle('off', !prefs.micOn);
    fillMenu($('#cam-menu'), cams, cam?.deviceId, 'No camera', (id) => {
      prefs.camOn = !!id; if (id) prefs.camId = id;
      chrome.storage.local.set({ camOn: prefs.camOn, camId: prefs.camId });
      closeMenus(); renderDevices();
    });
    fillMenu($('#mic-menu'), mics, mic?.deviceId, 'No microphone', (id) => {
      prefs.micOn = !!id; if (id) prefs.micId = id;
      chrome.storage.local.set({ micOn: prefs.micOn, micId: prefs.micId });
      closeMenus(); renderDevices(); startMeter();
    });
  }

  $('#cam-btn').addEventListener('click', () => toggleMenu($('#cam-btn'), $('#cam-menu')));
  $('#mic-btn').addEventListener('click', () => toggleMenu($('#mic-btn'), $('#mic-menu')));
  $('#cam-toggle').addEventListener('click', () => {
    prefs.camOn = !prefs.camOn;
    chrome.storage.local.set({ camOn: prefs.camOn });
    renderDevices();
  });
  $('#mic-toggle').addEventListener('click', () => {
    prefs.micOn = !prefs.micOn;
    chrome.storage.local.set({ micOn: prefs.micOn });
    renderDevices();
    startMeter();
  });

  // ---------- live microphone level (the blue bar, like Loom's) ----------
  function stopMeter() {
    cancelAnimationFrame(meterId);
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
    audioCtx?.close().catch(() => {});
    audioCtx = null;
    $('#mic-level').style.width = '0';
  }

  async function startMeter() {
    stopMeter();
    if (!prefs.micOn) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: prefs.micId ? { deviceId: { exact: prefs.micId } } : true });
    } catch (err) {
      if (err.name === 'NotAllowedError') $('#allow').hidden = false;
      return;
    }
    audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const draw = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      $('#mic-level').style.width = `${Math.min(100, (peak / 128) * 260)}%`;
      meterId = requestAnimationFrame(draw);
    };
    draw();
  }

  // Ask for camera and microphone once, so device names show up.
  async function ensurePermission() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      s.getTracks().forEach((t) => t.stop());
      $('#allow').hidden = true;
      return true;
    } catch (err) {
      $('#allow').hidden = false;
      return false;
    }
  }
  $('#allow-btn').addEventListener('click', () => send({ type: 'vp:open-settings' }));

  // ---------- footer ----------
  function renderFooter() {
    $('#countdown').setAttribute('aria-pressed', String(prefs.countdownOn));
    $('#countdown-label').textContent = prefs.countdownOn ? '3s timer' : 'No timer';
    $('#flip').setAttribute('aria-pressed', String(prefs.flipCam));
  }
  $('#countdown').addEventListener('click', () => {
    prefs.countdownOn = !prefs.countdownOn;
    chrome.storage.local.set({ countdownOn: prefs.countdownOn });
    renderFooter();
  });
  $('#flip').addEventListener('click', () => {
    prefs.flipCam = !prefs.flipCam;
    chrome.storage.local.set({ flipCam: prefs.flipCam });
    renderFooter();
  });
  $('#library').addEventListener('click', () => send({ type: 'vp:open-library' }));
  $('#home').addEventListener('click', () => send({ type: 'vp:open-library' }));
  $('#settings').addEventListener('click', () => send({ type: 'vp:open-settings' }));
  $('#close').addEventListener('click', () => { stopMeter(); send({ type: 'vp:panel-close' }); });

  // ---------- start ----------
  $('#start').addEventListener('click', async () => {
    setError('');
    $('#start').disabled = true;
    stopMeter(); // free the microphone for the recorder
    let res;
    try {
      res = await send({
        type: 'vp:start',
        opts: { mode: prefs.mode, mic: prefs.micOn, micId: prefs.micId, camId: prefs.camId, countdown: prefs.countdownOn },
      });
    } catch (err) {
      res = { ok: false, error: err.message };
    }
    $('#start').disabled = false;
    if (!res?.ok) {
      if (!res?.cancelled) setError(res?.error || 'Could not start recording.');
      startMeter();
    }
  });

  // ---------- boot ----------
  (async () => {
    const p = await chrome.storage.local.get(['mode', 'camOn', 'micOn', 'camId', 'micId', 'countdownOn', 'flipCam']);
    Object.assign(prefs, {
      mode: MODES[p.mode] ? p.mode : 'tab',
      camOn: p.camOn !== false, micOn: p.micOn !== false,
      camId: p.camId || '', micId: p.micId || '',
      countdownOn: p.countdownOn !== false, flipCam: !!p.flipCam,
    });
    renderSource();
    renderFooter();
    await ensurePermission();
    await renderDevices();
    startMeter();
  })();
  addEventListener('pagehide', stopMeter);
})();
