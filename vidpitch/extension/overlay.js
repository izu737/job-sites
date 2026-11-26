// Injected into the page you record, like Loom's: the recorder panel (top
// right), your camera bubble (bottom left), the 3, 2, 1 countdown and the
// recording control bar. Everything lives in a shadow root so the page's CSS
// cannot touch it and it cannot touch the page.
(() => {
  if (window.__vidpitchOverlay) return;
  window.__vidpitchOverlay = true;

  const EXT = chrome.runtime.getURL('').replace(/\/$/, '');
  const SIZES = { small: 120, medium: 200, large: 300 };
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

  let host = null;
  let root = null;
  let state = { phase: 'idle' };
  let timerId = null;
  let prefs = { camOn: true, camSize: 'medium', bubbleX: null, bubbleY: null };

  const ICONS = {
    stop: '<span class="sq"></span>',
    pause: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.8-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" fill="currentColor"/></svg>',
    restart: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 12a7 7 0 1 0 2.1-5M5 4.5v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cancel: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="m6.5 6.5 11 11m0-11-11 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Inter, "Atlassian Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
    .panel { position: fixed; top: 16px; right: 16px; width: 300px; height: 420px; border: 0; border-radius: 16px; background: transparent; pointer-events: auto; color-scheme: normal;
      box-shadow: 0 8px 28px rgba(9, 30, 66, .25), 0 0 1px rgba(9, 30, 66, .31); transition: opacity .15s ease-out; }
    .bubble { position: fixed; left: 16px; bottom: 16px; width: var(--d); height: var(--d); border-radius: 50%; pointer-events: auto; cursor: grab; touch-action: none;
      transition: width .2s cubic-bezier(.16,1,.3,1), height .2s cubic-bezier(.16,1,.3,1); }
    .bubble.dragging { cursor: grabbing; transition: none; }
    .bubble iframe { width: 100%; height: 100%; border: 0; border-radius: 50%; pointer-events: none; display: block; background: #292a2e; }
    .bubble-tools { position: absolute; left: 50%; top: -6px; transform: translate(-50%, -100%); display: flex; gap: 2px; padding: 3px; border-radius: 8px; background: rgba(31, 31, 33, .92);
      opacity: 0; pointer-events: none; transition: opacity .15s ease-out; }
    .bubble:hover .bubble-tools { opacity: 1; pointer-events: auto; }
    .bubble-tools button { width: 26px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: #cecfd2; font-size: 11px; font-weight: 653; cursor: pointer; }
    .bubble-tools button:hover { background: rgba(255,255,255,.14); color: #fff; }
    .bubble-tools button.on { background: rgba(255,255,255,.2); color: #fff; }

    .bar { position: fixed; left: 12px; top: 120px; display: flex; flex-direction: column; align-items: center; gap: 6px; width: 52px; padding: 6px 0 8px;
      border-radius: 12px; background: #1f1f21; border: 1px solid rgba(255,255,255,.1); box-shadow: 0 6px 24px rgba(0,0,0,.35); pointer-events: auto; color: #fff; }
    .bar button { display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 8px; background: transparent; color: #cecfd2; cursor: pointer; transition: background-color .15s ease-out, color .15s ease-out; }
    .bar button:hover { background: rgba(255,255,255,.12); color: #fff; }
    .bar button:focus-visible { outline: 2px solid #8fb8f6; outline-offset: 1px; }
    .bar .stop { background: rgba(255,255,255,.1); }
    .bar .stop .sq { width: 16px; height: 16px; border-radius: 3px; background: #fff; }
    .bar .stop:hover { background: #e5484d; }
    .bar .time { font-size: 12px; font-weight: 653; color: #b7b9be; font-variant-numeric: tabular-nums; line-height: 1; padding: 2px 0; }
    .bar .pause.paused { background: #1868db; color: #fff; }
    .bar .pause.paused:hover { background: #1558c0; }
    .bar hr { width: 28px; border: 0; border-top: 1px solid rgba(255,255,255,.16); margin: 2px 0; }

    .countdown { position: fixed; inset: 0; display: grid; place-items: center; pointer-events: auto; background: rgba(9, 10, 12, .35); }
    .count { display: grid; place-items: center; width: 168px; height: 168px; border-radius: 50%; background: rgba(23, 24, 26, .82); color: #fff;
      font-size: 96px; font-weight: 653; line-height: 1; font-variant-numeric: tabular-nums; box-shadow: 0 10px 40px rgba(0,0,0,.35); }
    .count.tick { animation: tick .9s cubic-bezier(.16,1,.3,1); }
    @keyframes tick { 0% { transform: scale(.6); opacity: 0; } 25% { transform: scale(1); opacity: 1; } 85% { opacity: 1; } 100% { opacity: .2; transform: scale(.94); } }
    .skip { position: absolute; bottom: 28%; color: rgba(255,255,255,.85); font-size: 13px; font-weight: 500; background: rgba(23,24,26,.7); padding: 6px 12px; border-radius: 999px; border: 0; cursor: pointer; }
    @media (prefers-reduced-motion: reduce) { .count.tick { animation: none; } }
  `;

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('vidpitch-recorder');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="layer"></div>`;
    document.documentElement.appendChild(host);
  }
  const layer = () => root.querySelector('.layer');
  const $ = (sel) => root?.querySelector(sel);

  // ---------- panel ----------
  function showPanel() {
    ensureHost();
    if ($('.panel')) return;
    const frame = document.createElement('iframe');
    frame.className = 'panel';
    frame.src = `${EXT}/panel.html`;
    frame.allow = 'camera; microphone';
    frame.title = 'Vidpitch recorder';
    layer().appendChild(frame);
  }
  const hidePanel = () => $('.panel')?.remove();

  window.addEventListener('message', (e) => {
    if (e.origin !== EXT || !e.data || e.data.vp !== true) return;
    if (e.data.kind === 'resize' && $('.panel')) $('.panel').style.height = `${Math.ceil(e.data.height)}px`;
  });

  // ---------- camera bubble ----------
  function placeBubble(el) {
    const d = SIZES[prefs.camSize] || SIZES.medium;
    el.style.setProperty('--d', `${d}px`);
    if (prefs.bubbleX != null && prefs.bubbleY != null) {
      const x = Math.min(Math.max(8, prefs.bubbleX), innerWidth - d - 8);
      const y = Math.min(Math.max(8, prefs.bubbleY), innerHeight - d - 8);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.bottom = 'auto';
    }
    el.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === prefs.camSize));
    placeBar();
  }

  function showBubble() {
    ensureHost();
    if (!prefs.camOn) return $('.bubble')?.remove();
    let el = $('.bubble');
    if (!el) {
      el = document.createElement('div');
      el.className = 'bubble';
      el.innerHTML = `<iframe src="${EXT}/bubble.html" allow="camera; microphone" title="Your camera"></iframe>
        <div class="bubble-tools" role="group" aria-label="Bubble size">
          <button type="button" data-size="small" title="Small">S</button>
          <button type="button" data-size="medium" title="Medium">M</button>
          <button type="button" data-size="large" title="Large">L</button>
        </div>`;
      el.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.storage.local.set({ camSize: b.dataset.size });
      }));
      makeDraggable(el);
      layer().appendChild(el);
    }
    placeBubble(el);
  }

  function makeDraggable(el) {
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      el.style.left = `${start.left + e.clientX - start.x}px`;
      el.style.top = `${start.top + e.clientY - start.y}px`;
      el.style.bottom = 'auto';
    });
    const end = () => {
      if (!start) return;
      start = null;
      el.classList.remove('dragging');
      const r = el.getBoundingClientRect();
      chrome.storage.local.set({ bubbleX: Math.round(r.left), bubbleY: Math.round(r.top) });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ---------- control bar ----------
  function placeBar() {
    const bar = $('.bar');
    const bubble = $('.bubble');
    if (!bar) return;
    // Sit just above the bubble when it is in the bottom left, like Loom.
    if (bubble) {
      const r = bubble.getBoundingClientRect();
      const top = Math.max(12, r.top - bar.offsetHeight - 12);
      bar.style.top = `${r.left < 120 ? top : 120}px`;
    }
  }

  function showBar() {
    ensureHost();
    let bar = $('.bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'bar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Recording controls');
      bar.innerHTML = `
        <button type="button" class="stop" data-act="stop" title="Stop and share" aria-label="Stop and share">${ICONS.stop}</button>
        <span class="time" aria-live="off">0:00</span>
        <button type="button" class="pause" data-act="pause" title="Pause" aria-label="Pause">${ICONS.pause}</button>
        <button type="button" data-act="restart" title="Restart" aria-label="Restart recording">${ICONS.restart}</button>
        <button type="button" data-act="cancel" title="Cancel" aria-label="Cancel recording">${ICONS.cancel}</button>`;
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        let action = btn.dataset.act;
        if (action === 'pause' && state.phase === 'paused') action = 'resume';
        if (action === 'cancel' && !confirm('Cancel this recording? It will be thrown away.')) return;
        if (action === 'restart' && !confirm('Restart? What you recorded so far will be thrown away.')) return;
        send({ type: 'vp:control', action });
      });
      layer().appendChild(bar);
    }
    const paused = state.phase === 'paused';
    const pause = bar.querySelector('.pause');
    pause.classList.toggle('paused', paused);
    pause.innerHTML = paused ? ICONS.play : ICONS.pause;
    pause.title = paused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    placeBar();
    if (!timerId) timerId = setInterval(tick, 250);
    tick();
  }

  function tick() {
    const el = $('.bar .time');
    if (!el || !state.startedAt) return;
    const end = state.phase === 'paused' ? state.pausedAt : Date.now();
    const s = Math.max(0, Math.floor((end - state.startedAt - (state.pausedMs || 0)) / 1000));
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ---------- 3, 2, 1 ----------
  function countdown(seconds) {
    ensureHost();
    hidePanel();
    $('.bar')?.remove();
    if (!seconds) return finishCountdown();
    const wrap = document.createElement('div');
    wrap.className = 'countdown';
    wrap.innerHTML = '<div class="count" role="timer" aria-live="assertive"></div><button type="button" class="skip">Skip countdown</button>';
    layer().appendChild(wrap);
    const count = wrap.querySelector('.count');
    let n = seconds;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(iv);
      wrap.remove();
      finishCountdown();
    };
    const show = () => {
      count.textContent = String(n);
      count.classList.remove('tick');
      void count.offsetWidth;
      count.classList.add('tick');
    };
    show();
    const iv = setInterval(() => { n -= 1; if (n <= 0) finish(); else show(); }, 1000);
    wrap.querySelector('.skip').addEventListener('click', finish);
  }

  function finishCountdown() {
    // Wait until the countdown is really gone from the screen before recording.
    let sent = false;
    const go = () => { if (!sent) { sent = true; send({ type: 'vp:countdown-done' }); } };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 120); // background tabs do not run animation frames
  }

  function teardown() {
    clearInterval(timerId);
    timerId = null;
    host?.remove();
    host = null;
    root = null;
  }

  function render() {
    if (['recording', 'paused'].includes(state.phase)) {
      hidePanel();
      showBubble();
      showBar();
    }
  }

  // ---------- messages ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg?.type) return;
    if (msg.type === 'vp:toggle-panel') {
      if ($('.panel')) { send({ type: 'vp:panel-close' }); return; }
      showPanel();
      showBubble();
    }
    if (msg.type === 'vp:countdown') countdown(msg.seconds);
    if (msg.type === 'vp:state') { state = msg.state; render(); }
    if (msg.type === 'vp:teardown') teardown();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let touched = false;
    for (const k of ['camOn', 'camSize', 'bubbleX', 'bubbleY']) {
      if (changes[k]) { prefs[k] = changes[k].newValue; touched = true; }
    }
    if (touched && host) {
      if (changes.camOn) showBubble();
      else if ($('.bubble')) placeBubble($('.bubble'));
    }
  });

  chrome.storage.local.get(['camOn', 'camSize', 'bubbleX', 'bubbleY']).then((p) => {
    prefs = { ...prefs, ...p, camOn: p.camOn !== false };
  });
  addEventListener('resize', () => { const b = $('.bubble'); if (b) placeBubble(b); });
})();
