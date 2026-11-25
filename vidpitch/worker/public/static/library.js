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
    const img = e.target.closest('.thumb img');
    if (img && img.src !== img.dataset.gif) img.src = img.dataset.gif;
  });
  grid.addEventListener('pointerout', (e) => {
    const img = e.target.closest('.thumb img');
    if (img && !img.closest('.thumb').contains(e.relatedTarget)) img.src = img.dataset.poster;
  });

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const id = card.dataset.id;
    const act = btn.dataset.act;

    if (act === 'copy-link') {
      await navigator.clipboard.writeText(card.querySelector('.card-link input').value);
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

    if (act === 'rename') {
      const titleEl = card.querySelector('.card-title');
      const title = prompt('New title', titleEl.textContent);
      if (!title || !title.trim() || title.trim() === titleEl.textContent) return;
      const res = await fetch(`/api/videos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!res.ok) return toast('Could not rename. Try again.');
      const v = await res.json();
      titleEl.textContent = v.title;
      card.dataset.title = v.title.toLowerCase();
      card.querySelector('.email-html').innerHTML = v.emailHtml;
      card.querySelector('.email-text').textContent = v.emailText;
      toast('Renamed');
    }

    if (act === 'delete') {
      const title = card.querySelector('.card-title').textContent;
      if (!confirm(`Delete "${title}"? Its link will stop working for anyone you sent it to.`)) return;
      const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      if (!res.ok) return toast('Could not delete. Try again.');
      card.remove();
      toast('Deleted');
      if (!grid.children.length) location.reload();
    }
  });

  const search = document.querySelector('.search');
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
