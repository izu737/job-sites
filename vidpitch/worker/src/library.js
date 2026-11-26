// The private pages: sign in, your video library, and the recorder.
import { esc, formatDuration, serialize } from './views.js';

const LOGO = '<img src="/app/icons/icon48.png" alt="" width="28" height="28">';

function shell({ title, body, scripts = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="icon" href="/app/icons/icon32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap">
<link rel="stylesheet" href="/static/app.css">
</head>
<body>
${body}
${scripts}
</body>
</html>`;
}

export function loginPage({ error = '', next = '/' } = {}) {
  return shell({
    title: 'Sign in | Vidpitch',
    body: `
<main class="login">
  <a class="brand brand-light" href="/login">${LOGO}<span>Vidpitch</span></a>
  <form class="login-form" method="post" action="/login">
    <h1>Sign in to your library</h1>
    <p class="sub">Use your access key. It is the same one the extension uses.</p>
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="key">Access key</label>
    <input id="key" name="key" type="password" placeholder="Enter your access key" autocomplete="current-password" required autofocus>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    <button class="btn btn-primary btn-block" type="submit">Continue</button>
  </form>
</main>`,
  });
}

const ICON = {
  link: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  mail: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="2.8" y="4.5" width="14.4" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m3.5 5.5 6.5 5 6.5-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  more: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="4.5" cy="10" r="1.5" fill="currentColor"/><circle cx="10" cy="10" r="1.5" fill="currentColor"/><circle cx="15.5" cy="10" r="1.5" fill="currentColor"/></svg>',
  search: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m13.2 13.2 3.6 3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  camera: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="2.5" y="5.5" width="11" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m13.5 9 4-2.5v7l-4-2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  library: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="11" y="3" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="11" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="11" y="11" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  signout: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8M12 6.5 15.5 10 12 13.5M15.5 10H8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function initials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

function card(cfg, row) {
  const v = serialize(cfg, row);
  const date = new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dur = formatDuration(row.duration);
  return `
  <article class="card" data-id="${esc(v.id)}" data-title="${esc(v.title.toLowerCase())}">
    <div class="thumb">
      <a class="thumb-link" href="${esc(v.shareUrl)}" target="_blank" rel="noopener" aria-label="Open ${esc(v.title)}"></a>
      <img src="${esc(v.posterUrl)}" data-poster="${esc(v.posterUrl)}" data-gif="${esc(v.gifUrl)}" alt="" loading="lazy">
      ${dur ? `<span class="dur">${esc(dur)}</span>` : ''}
      <div class="thumb-actions">
        <button type="button" class="chip" data-act="copy-link" data-url="${esc(v.shareUrl)}">${ICON.link}<span>Copy link</span></button>
        <button type="button" class="chip chip-icon" data-act="copy-email" title="Copy for email" aria-label="Copy for email">${ICON.mail}</button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-top">
        <a class="card-title" href="${esc(v.shareUrl)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <details class="menu">
          <summary aria-label="More actions">${ICON.more}</summary>
          <div class="menu-pop">
            <button type="button" data-act="copy-link" data-url="${esc(v.shareUrl)}">Copy link</button>
            <button type="button" data-act="copy-email">Copy for email</button>
            <button type="button" data-act="rename">Rename</button>
            <a href="${esc(v.shareUrl)}" target="_blank" rel="noopener">Open video page</a>
            <hr>
            <button type="button" class="danger" data-act="delete">Delete</button>
          </div>
        </details>
      </div>
      <div class="card-meta"><span class="avatar avatar-xs">${esc(initials(cfg.ownerName))}</span><span>${esc(cfg.ownerName)}</span><span class="sep" aria-hidden="true">·</span><span>${esc(date)}</span><span class="sep" aria-hidden="true">·</span><span>${Number(row.views || 0)} view${Number(row.views || 0) === 1 ? '' : 's'}</span></div>
    </div>
    <template class="email-html">${v.emailHtml}</template>
    <template class="email-text">${esc(v.emailText)}</template>
  </article>`;
}

export function libraryPage(cfg, rows) {
  return shell({
    title: 'My Library | Vidpitch',
    body: `
<div class="app">
  <aside class="nav">
    <a class="brand" href="/">${LOGO}<span>Vidpitch</span></a>
    <nav class="nav-items">
      <a class="nav-item on" href="/" aria-current="page">${ICON.library}<span>My Library</span></a>
      <a class="nav-item" href="/record">${ICON.camera}<span>Record a video</span></a>
    </nav>
    <div class="nav-foot">
      <span class="avatar">${esc(initials(cfg.ownerName))}</span>
      <span class="nav-name">${esc(cfg.ownerName)}</span>
      <a class="icon-btn" href="/logout" title="Sign out" aria-label="Sign out">${ICON.signout}</a>
    </div>
  </aside>

  <main class="content">
    <header class="topbar">
      <label class="search">${ICON.search}<input type="search" placeholder="Search for videos" aria-label="Search videos"></label>
      <a class="btn btn-primary" href="/record">${ICON.camera}<span>New video</span></a>
    </header>

    <div class="page">
      <h1>My Library</h1>
      <div class="tabs"><span class="tab on">Videos <span class="count">${rows.length}</span></span></div>
      ${rows.length ? `<div class="grid" id="grid">${rows.map((r) => card(cfg, r)).join('')}</div>
      <p class="empty-search" hidden>No videos match that search.</p>` : `
      <div class="empty">
        <span class="empty-icon">${ICON.camera}</span>
        <h2>Record your first video</h2>
        <p>Your screen and your face, with a moving preview ready for Gmail.</p>
        <a class="btn btn-primary" href="/record">${ICON.camera}<span>New video</span></a>
      </div>`}
    </div>
  </main>
</div>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`,
    scripts: '<script src="/static/library.js" defer></script>',
  });
}

/** The extension's recorder page, served from /app/ so its files resolve. */
export function recordPage(recorderHtml) {
  return recorderHtml
    .replace('<head>', '<head>\n<base href="/app/">')
    .replace('<title>Vidpitch Recorder</title>', '<title>New video | Vidpitch</title>');
}
