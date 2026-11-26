// Owner view of a video page (you are signed in): Share, copy for email,
// rename, booking button settings, delete. Mirrors Loom's video page.
(() => {
  const meta = document.getElementById('vp-meta');
  if (!meta) return;
  const id = meta.dataset.id;
  const shareUrl = meta.dataset.shareUrl;
  const toastEl = document.getElementById('toast');
  let toastTimer;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  async function patch(body) {
    const res = await fetch(`/api/videos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('save failed');
    return res.json();
  }

  // ---------- Share popover ----------
  const pop = document.getElementById('share-pop');
  const opener = document.querySelector('[data-share-open]');
  function setPop(open) {
    pop.hidden = !open;
    opener.setAttribute('aria-expanded', String(open));
  }
  opener?.addEventListener('click', (e) => { e.stopPropagation(); setPop(pop.hidden); });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) setPop(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { setPop(false); opener.focus(); } });

  // ---------- copy for email (GIF block) ----------
  document.querySelectorAll('[data-copy-email]').forEach((btn) => btn.addEventListener('click', async () => {
    const html = document.getElementById('email-html').innerHTML;
    const text = document.getElementById('email-text').textContent;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      toast('Copied. Paste it into Gmail or any email.');
    } catch {
      await navigator.clipboard.writeText(text).catch(() => {});
      toast('Copied the link.');
    }
    setPop(false);
  }));

  // ---------- sidebar tabs ----------
  document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((t) => {
      const on = t === tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  }));

  // ---------- rename by clicking the title ----------
  const title = document.querySelector('[data-edit-title]');
  let original = title?.textContent || '';
  function startEdit() {
    if (title.isContentEditable) return;
    original = title.textContent;
    title.contentEditable = 'plaintext-only';
    title.focus();
    const range = document.createRange();
    range.selectNodeContents(title);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }
  async function endEdit(save) {
    if (!title.isContentEditable) return;
    title.contentEditable = 'false';
    const next = title.textContent.replace(/\s+/g, ' ').trim();
    if (!save || !next || next === original) { title.textContent = original; return; }
    try {
      const v = await patch({ title: next });
      title.textContent = v.title;
      document.title = `${v.title} | ${document.title.split(' | ').pop()}`;
      document.getElementById('email-html').innerHTML = v.emailHtml;
      document.getElementById('email-text').textContent = v.emailText;
      toast('Renamed');
    } catch {
      title.textContent = original;
      toast('Could not rename. Try again.');
    }
  }
  title?.addEventListener('click', startEdit);
  title?.addEventListener('keydown', (e) => {
    if (!title.isContentEditable && e.key === 'Enter') { e.preventDefault(); startEdit(); return; }
    if (e.key === 'Enter') { e.preventDefault(); endEdit(true); }
    if (e.key === 'Escape') endEdit(false);
  });
  title?.addEventListener('blur', () => endEdit(true));

  // ---------- booking button settings ----------
  document.querySelector('[data-cta-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      await patch({ ctaUrl: f.ctaUrl.value.trim(), ctaLabel: f.ctaLabel.value.trim() });
      toast('Saved. Reload to see the new button.');
    } catch {
      toast('Could not save. Check the link starts with https://');
    }
  });

  // ---------- delete ----------
  document.querySelector('[data-delete]')?.addEventListener('click', () => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    dlg.innerHTML = '<h2>Delete this video?</h2><p>It will be gone for good, and its link will stop working for anyone you sent it to.</p><div class="row"><button type="button" class="btn btn-quiet" value="no">Cancel</button><button type="button" class="btn btn-danger" value="yes">Delete</button></div>';
    document.body.append(dlg);
    dlg.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b && e.target !== dlg) return;
      dlg.close();
      dlg.remove();
      if (b?.value !== 'yes') return;
      const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      if (res.ok) location.href = '/';
      else toast('Could not delete. Try again.');
    });
    dlg.showModal();
    dlg.querySelector('[value=no]').focus();
  });

  // ---------- just recorded: copy the link, like Loom ----------
  if (meta.dataset.new === '1') {
    history.replaceState(null, '', location.pathname);
    navigator.clipboard.writeText(shareUrl)
      .then(() => toast('Your video is ready. Link copied to clipboard.'))
      .catch(() => toast('Your video is ready.'));
  }
})();
