(() => {
  const grid = document.getElementById('grid');
  const toastEl = document.getElementById('toast');
  let toastTimer;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
  }
  if (!grid) return;

  // Hovering a thumbnail plays the same GIF your prospects see in email.
  grid.addEventListener('pointerover', (e) => {
    const img = e.target.closest('.thumb')?.querySelector('img');
    if (img && img.src !== img.dataset.gif) img.src = img.dataset.gif;
  });
  grid.addEventListener('pointerout', (e) => {
    const thumb = e.target.closest('.thumb');
    if (thumb && !thumb.contains(e.relatedTarget)) thumb.querySelector('img').src = thumb.querySelector('img').dataset.poster;
  });

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const id = card.dataset.id;
    const act = btn.dataset.act;

    card.querySelector('.menu')?.removeAttribute('open');

    if (act === 'copy-link') {
      await navigator.clipboard.writeText(btn.dataset.url);
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1400);
      toast('Link copied');
    }

    if (act === 'copy-email') {
      const html = card.querySelector('.email-html').innerHTML;
      const text = card.querySelector('.email-text').textContent;
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
        toast('Copied. Paste it into Gmail or any email.');
      } catch {
        await navigator.clipboard.writeText(text);
        toast('Copied the link (your browser blocked rich copy).');
      }
    }

    if (act === 'rename') startRename(card);

    if (act === 'delete') {
      const title = card.querySelector('.card-title').textContent;
      if (!(await confirmDelete(title))) return;
      const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      if (!res.ok) return toast('Could not delete. Try again.');
      card.style.transition = 'opacity .2s, transform .2s';
      card.style.opacity = '0';
      card.style.transform = 'scale(.97)';
      setTimeout(() => { card.remove(); if (!grid.children.length) location.reload(); }, 200);
      toast('Deleted');
    }
  });

  // Rename in place: Enter saves, Escape cancels.
  function startRename(card) {
    const titleEl = card.querySelector('.card-title');
    if (card.querySelector('.title-edit')) return;
    const input = document.createElement('input');
    input.className = 'title-edit';
    input.value = titleEl.textContent;
    input.maxLength = 200;
    input.setAttribute('aria-label', 'Video title');
    titleEl.hidden = true;
    titleEl.after(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const title = input.value.trim();
      input.remove();
      titleEl.hidden = false;
      if (!save || !title || title === titleEl.textContent) return;
      const res = await fetch(`/api/videos/${card.dataset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return toast('Could not rename. Try again.');
      const v = await res.json();
      titleEl.textContent = v.title;
      card.dataset.title = v.title.toLowerCase();
      card.querySelector('.email-html').innerHTML = v.emailHtml;
      card.querySelector('.email-text').textContent = v.emailText;
      toast('Renamed');
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  // A proper dialog instead of the browser's confirm box.
  function confirmDelete(title) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'confirm';
      dlg.innerHTML = '<h2>Delete this video?</h2><p></p><div class="row"><button type="button" class="btn btn-quiet" value="no">Cancel</button><button type="button" class="btn btn-danger" value="yes">Delete</button></div>';
      dlg.querySelector('p').textContent = `"${title}" will be gone for good, and its link will stop working for anyone you sent it to.`;
      document.body.append(dlg);
      const close = (answer) => { dlg.close(); dlg.remove(); resolve(answer); };
      dlg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) close(b.value === 'yes');
        else if (e.target === dlg) close(false); // click on the backdrop
      });
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
      dlg.showModal();
      dlg.querySelector('[value=no]').focus();
    });
  }

  // Close an open menu when clicking anywhere else.
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.menu[open]').forEach((m) => { if (!m.contains(e.target)) m.removeAttribute('open'); });
  });

  const search = document.querySelector('.search input');
  const noMatch = document.querySelector('.empty-search');
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const card of grid.children) {
      const hit = !q || card.dataset.title.includes(q);
      card.hidden = !hit;
      if (hit) shown++;
    }
    noMatch.hidden = shown > 0;
  });
})();
