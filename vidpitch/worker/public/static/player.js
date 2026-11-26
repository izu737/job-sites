(() => {
  // Copy link buttons (title row, and the Share split button for the owner).
  const toastEl = document.getElementById('toast');
  let toastTimer;
  const shareUrl = document.getElementById('vp-meta')?.dataset.shareUrl || (location.origin + location.pathname);
  document.querySelectorAll('[data-copy-link]').forEach((btn) => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareUrl); } catch { return; }
    if (!toastEl) return;
    toastEl.textContent = 'Link copied';
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2000);
    document.getElementById('share-pop')?.setAttribute('hidden', '');
  }));

  const root = document.getElementById('player');
  if (!root) return;

  const video = root.querySelector('video');
  const bigPlay = root.querySelector('.bigplay');
  const pop = root.querySelector('.cta-pop');
  const endcard = root.querySelector('.endcard');
  const replay = root.querySelector('.replay');
  const scrub = root.querySelector('.scrub');
  const fill = root.querySelector('.scrub-fill');
  const buffer = root.querySelector('.scrub-buffer');
  const curEl = root.querySelector('[data-cur]');
  const durEl = root.querySelector('[data-dur]');
  const speedBtn = root.querySelector('[data-act="speed"]');

  const knownDuration = parseFloat(root.dataset.duration) || 0;
  const ctaLead = parseFloat(root.dataset.ctaLead) || 6;
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

  // Recordings that are still WebM report an "Infinity" duration in Chrome,
  // so fall back to the length the recorder told the server.
  const duration = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : knownDuration);

  const fmt = (s) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
  };

  function play() {
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  }
  function toggle() {
    if (video.paused || video.ended) play(); else video.pause();
  }

  function render() {
    const d = duration();
    const t = video.currentTime;
    const pct = d ? Math.min(100, (t / d) * 100) : 0;
    fill.style.width = pct + '%';
    scrub.setAttribute('aria-valuenow', String(Math.round(pct)));
    curEl.textContent = fmt(t);
    if (d) durEl.textContent = fmt(d);
    if (video.buffered.length && d) {
      buffer.style.width = Math.min(100, (video.buffered.end(video.buffered.length - 1) / d) * 100) + '%';
    }
    if (pop) {
      // Slide the booking button in for the last few seconds. Short videos
      // get it for their final 40% so it still has time to be seen.
      const lead = Math.min(ctaLead, d * 0.4);
      pop.classList.toggle('show', d > 0 && t > 0 && d - t <= lead && !video.ended);
    }
  }

  function showEnd() {
    root.classList.add('is-ended');
    root.classList.remove('is-playing');
    pop?.classList.remove('show');
    endcard.hidden = false;
    const btn = endcard.querySelector('.btn-primary');
    if (btn) btn.focus({ preventScroll: true });
  }
  function hideEnd() {
    root.classList.remove('is-ended');
    endcard.hidden = true;
  }

  video.addEventListener('play', () => { hideEnd(); root.classList.add('is-playing', 'has-started'); wake(); });
  video.addEventListener('pause', () => { root.classList.remove('is-playing'); wake(); });
  video.addEventListener('timeupdate', render);
  video.addEventListener('progress', render);
  video.addEventListener('loadedmetadata', render);
  video.addEventListener('durationchange', render);
  video.addEventListener('ended', showEnd);
  video.addEventListener('volumechange', () => root.classList.toggle('is-muted', video.muted || video.volume === 0));
  video.addEventListener('click', toggle);
  video.addEventListener('dblclick', toggleFullscreen);
  bigPlay.addEventListener('click', play);
  replay.addEventListener('click', () => { video.currentTime = 0; play(); });

  root.querySelector('[data-act="play"]').addEventListener('click', toggle);
  root.querySelector('[data-act="mute"]').addEventListener('click', () => { video.muted = !video.muted; });
  const chip = root.querySelector('[data-chip-speed]');
  const chipText = root.querySelector('[data-chip-speed-text]');
  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(video.playbackRate) + 1) % SPEEDS.length] || 1;
    video.playbackRate = next;
    speedBtn.textContent = next + 'x';
    if (chipText) chipText.textContent = next + '×';
  }
  speedBtn.addEventListener('click', cycleSpeed);
  chip?.addEventListener('click', (e) => { e.stopPropagation(); cycleSpeed(); });
  root.querySelector('[data-act="fullscreen"]').addEventListener('click', toggleFullscreen);

  function toggleFullscreen() {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (root.requestFullscreen) return root.requestFullscreen().catch(() => {});
    if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
  }

  // Seeking by click or drag
  function seekTo(clientX) {
    const rect = scrub.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const d = duration();
    if (d) { video.currentTime = ratio * d; render(); }
  }
  scrub.addEventListener('pointerdown', (e) => {
    scrub.setPointerCapture(e.pointerId);
    scrub.classList.add('is-drag');
    seekTo(e.clientX);
  });
  scrub.addEventListener('pointermove', (e) => { if (scrub.classList.contains('is-drag')) seekTo(e.clientX); });
  const endDrag = () => scrub.classList.remove('is-drag');
  scrub.addEventListener('pointerup', endDrag);
  scrub.addEventListener('pointercancel', endDrag);
  scrub.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { video.currentTime = Math.min(duration(), video.currentTime + 5); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { video.currentTime = Math.max(0, video.currentTime - 5); e.preventDefault(); }
  });

  // Hide the controls while the mouse rests
  let idleTimer;
  function wake() {
    root.classList.remove('is-idle');
    clearTimeout(idleTimer);
    if (!video.paused) idleTimer = setTimeout(() => root.classList.add('is-idle'), 2500);
  }
  root.addEventListener('pointermove', wake);
  root.addEventListener('pointerdown', wake);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'k') {
      if (e.target.closest && e.target.closest('a, button') && key === ' ') return;
      toggle(); e.preventDefault();
    } else if (key === 'f') toggleFullscreen();
    else if (key === 'm') video.muted = !video.muted;
    else if (key === 'arrowright' && e.target === document.body) video.currentTime = Math.min(duration(), video.currentTime + 5);
    else if (key === 'arrowleft' && e.target === document.body) video.currentTime = Math.max(0, video.currentTime - 5);
  });

  render();
})();
