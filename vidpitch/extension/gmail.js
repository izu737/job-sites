// Runs inside Gmail.
//  1. "Insert into Gmail" from the recorder puts the video block at your cursor.
//  2. Paste (or type) one of your video links into a draft and it turns into
//     the GIF preview by itself.
// Gmail's class names are scrambled and change often, so this only relies on
// stable attributes: contenteditable, role and aria-label.
(() => {
  if (window.__vidpitchGmail) return;
  window.__vidpitchGmail = true;

  const BODY_SELECTOR = 'div[contenteditable="true"][role="textbox"]';
  let lastBody = null;
  let lastRange = null;
  let publicUrl = '';

  // ---------- which links are ours ----------
  chrome.storage.local.get(['publicUrl', 'serverUrl']).then((s) => { publicUrl = s.publicUrl || s.serverUrl || ''; });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.publicUrl) publicUrl = changes.publicUrl.newValue || '';
  });

  const norm = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();

  /** Returns the video id if this is a bare link to one of your videos. */
  function videoIdFrom(url) {
    if (!publicUrl) return null;
    const base = norm(publicUrl);
    const m = norm(url).match(/^(.*)\/v\/([a-z0-9]{12})$/i);
    if (!m || m[1] !== base) return null;
    // Ids are case sensitive, so take them from the original string.
    return String(url).trim().replace(/\/+$/, '').slice(-12);
  }

  // ---------- caret tracking ----------
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const node = sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const body = el && el.closest(BODY_SELECTOR);
    if (body) {
      lastBody = body;
      lastRange = sel.getRangeAt(0).cloneRange();
    }
  });

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  function findComposeBody() {
    if (lastBody && lastBody.isConnected && visible(lastBody)) return lastBody;
    const all = [...document.querySelectorAll(BODY_SELECTOR)].filter(visible);
    const preferred = all.filter((el) => el.getAttribute('g_editable') === 'true' || /message body/i.test(el.getAttribute('aria-label') || ''));
    const pool = preferred.length ? preferred : all;
    return pool[pool.length - 1] || null; // the newest draft
  }

  function atLineStart(body, range) {
    const before = document.createRange();
    before.selectNodeContents(body);
    before.setEnd(range.startContainer, range.startOffset);
    const holder = document.createElement('div');
    holder.append(before.cloneContents());
    return holder.textContent.trim() === '' || /(<br\s*\/?>|<\/div>|<\/p>)\s*$/i.test(holder.innerHTML);
  }

  /** Replace whatever the range covers with the video block. */
  function insertAt(body, range, html) {
    body.focus();
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const prefix = atLineStart(body, range) ? '' : '<br>';
    // execCommand keeps Gmail's undo history and draft autosave working.
    return document.execCommand('insertHTML', false, prefix + html + '<br>');
  }

  // ---------- 1. insert from the recorder ----------
  function insertFromRecorder(html) {
    const body = findComposeBody();
    if (!body) return { ok: false, reason: 'no-compose' };
    let range;
    if (lastRange && body.contains(lastRange.startContainer)) {
      range = lastRange;
    } else {
      // No cursor yet: put it at the top, above any signature.
      range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(true);
    }
    const ok = insertAt(body, range, html);
    lastRange = null;
    return ok ? { ok: true } : { ok: false, reason: 'insert-failed' };
  }

  // ---------- 2. paste a link, get the preview ----------
  const handled = new WeakSet();

  function lookup(id) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'vidpitch:lookup', id }, (res) => resolve(chrome.runtime.lastError ? null : res));
      } catch {
        resolve(null); // extension was reloaded; this Gmail tab needs a refresh
      }
    });
  }

  async function upgradeLink(body, node, id) {
    handled.add(node);
    const res = await lookup(id);
    if (!res?.ok || !node.isConnected) {
      if (res && res.error === 'not-connected') toast('Open the Vidpitch recorder once to connect it, then paste the link again.', 'error');
      return;
    }
    const range = document.createRange();
    range.selectNode(node);
    insertAt(body, range, res.emailHtml);
  }

  /** Bare links only: the anchor's text is the link itself. Our own block
   *  links say the title or "Watch video", so they are never touched. */
  function scan(body) {
    if (!publicUrl) return;
    for (const a of body.querySelectorAll('a[href]')) {
      if (handled.has(a)) continue;
      const id = videoIdFrom(a.getAttribute('href'));
      if (id && videoIdFrom(a.textContent) === id) upgradeLink(body, a, id);
    }
    // A link Gmail has not turned into an anchor yet, possibly mid sentence.
    // Ids are exactly 12 characters, so a half typed link never matches.
    const escaped = publicUrl.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}/v/[A-Za-z0-9]{12}/?(?=\\s|$)`, 'i');
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (handled.has(t) || t.parentElement.closest('a')) continue;
      const m = re.exec(t.textContent);
      if (m) hits.push([t, m.index, m[0]]);
    }
    for (const [t, index, url] of hits) {
      // Cut the link out into its own text node, then swap only that part.
      const linkNode = t.splitText(index);
      linkNode.splitText(url.length);
      upgradeLink(body, linkNode, videoIdFrom(url));
    }
  }

  let scanTimer;
  function scheduleScan(target) {
    const el = target && (target.nodeType === 1 ? target : target.parentElement);
    const body = el && el.closest && el.closest(BODY_SELECTOR);
    if (!body) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scan(body), 120);
  }
  document.addEventListener('input', (e) => scheduleScan(e.target), true);
  document.addEventListener('paste', (e) => scheduleScan(e.target), true);
  // Gmail sometimes linkifies after the input event, so watch for new links too.
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 && (n.tagName === 'A' || n.querySelector?.('a'))) return scheduleScan(r.target);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- toast ----------
  function toast(text, tone = 'info') {
    document.getElementById('vidpitch-toast')?.remove();
    const el = document.createElement('div');
    el.id = 'vidpitch-toast';
    el.textContent = text;
    Object.assign(el.style, {
      position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: 2147483647,
      padding: '12px 18px', borderRadius: '12px', maxWidth: 'min(520px, calc(100vw - 32px))',
      background: tone === 'error' ? '#2a1720' : '#17151f', color: '#fff',
      font: '500 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 16px 40px -8px rgba(0,0,0,.45)', borderLeft: `4px solid ${tone === 'error' ? '#ff5c7a' : '#1868db'}`,
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== 'vidpitch:insert') return;
    const result = insertFromRecorder(msg.html);
    if (result.ok) toast('Video added to your email.');
    else toast('Open a new email (or click into a draft), then press Ctrl+V or Cmd+V. The video is on your clipboard.', 'error');
    reply(result);
  });
})();
