// Runs inside Gmail. Puts the video block (GIF + link) into the email you
// are writing. Gmail's class names are scrambled and change often, so this
// only relies on stable attributes: contenteditable, role and aria-label.
(() => {
  if (window.__vidpitchGmail) return;
  window.__vidpitchGmail = true;

  const BODY_SELECTOR = 'div[contenteditable="true"][role="textbox"]';
  let lastBody = null;
  let lastRange = null;

  // Remember where your cursor was in a draft, so the video lands there.
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

  function insert(html) {
    const body = findComposeBody();
    if (!body) return { ok: false, reason: 'no-compose' };
    body.focus();
    const sel = document.getSelection();
    sel.removeAllRanges();
    if (lastRange && body.contains(lastRange.startContainer)) {
      sel.addRange(lastRange);
    } else {
      // No cursor yet: put it at the top, above any signature.
      const r = document.createRange();
      r.selectNodeContents(body);
      r.collapse(true);
      sel.addRange(r);
    }
    // Start on a fresh line if the cursor sits after text, e.g. "Hi Sam,|".
    const before = document.createRange();
    before.selectNodeContents(body);
    const caret = sel.getRangeAt(0);
    before.setEnd(caret.startContainer, caret.startOffset);
    const holder = document.createElement('div');
    holder.append(before.cloneContents());
    const atLineStart = holder.textContent.trim() === '' || /(<br\s*\/?>|<\/div>|<\/p>)\s*$/i.test(holder.innerHTML);
    // execCommand keeps Gmail's undo history and draft autosave working.
    const ok = document.execCommand('insertHTML', false, (atLineStart ? '' : '<br>') + html + '<br>');
    if (!ok) return { ok: false, reason: 'insert-failed' };
    lastRange = null;
    return { ok: true };
  }

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
      boxShadow: '0 16px 40px -8px rgba(0,0,0,.45)', borderLeft: `4px solid ${tone === 'error' ? '#ff5c7a' : '#5b4bff'}`,
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== 'vidpitch:insert') return;
    const result = insert(msg.html);
    if (result.ok) toast('Video added to your email.');
    else toast('Open a new email (or click into a draft), then press Ctrl+V or Cmd+V. The video is on your clipboard.', 'error');
    reply(result);
  });
})();
