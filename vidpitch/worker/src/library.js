// The private pages: sign in, your video library, and the recorder.
import { esc, formatDuration, serialize } from './views.js';

const LOGO = '<img src="/app/icons/icon48.png" alt="" width="28" height="28">';
const PLUS = '<span class="rec-dot" aria-hidden="true"></span>';

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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
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
  <form class="login-card" method="post" action="/login">
    <div class="brand">${LOGO}<span>Vidpitch</span></div>
    <h1>Sign in</h1>
    <p class="sub">Use your access key. It is the same API token you put in the extension.</p>
    <input type="hidden" name="next" value="${esc(next)}">
    <label>Access key
      <input name="key" type="password" autocomplete="current-password" required autofocus>
    </label>
    ${error ? `<p class="error">${esc(error)}</p>` : ''}
    <button class="btn btn-primary btn-lg" type="submit">Sign in</button>
  </form>
</main>`,
  });
}

function card(cfg, row) {
  const v = serialize(cfg, row);
  const date = new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dur = formatDuration(row.duration);
  return `
  <article class="card" data-id="${esc(v.id)}" data-title="${esc(v.title.toLowerCase())}">
    <a class="thumb" href="${esc(v.shareUrl)}" target="_blank" rel="noopener" title="Open video page">
      <img src="${esc(v.posterUrl)}" data-poster="${esc(v.posterUrl)}" data-gif="${esc(v.gifUrl)}" alt="" loading="lazy">
      ${dur ? `<span class="dur">${esc(dur)}</span>` : ''}
    </a>
    <div class="card-body">
      <a class="card-title" href="${esc(v.shareUrl)}" target="_blank" rel="noopener">${esc(v.title)}</a>
      <div class="card-meta">${esc(date)}</div>
      <div class="card-link">
        <input type="text" readonly value="${esc(v.shareUrl)}" aria-label="Share link">
        <button type="button" class="btn btn-ghost btn-sm" data-act="copy-link">Copy link</button>
      </div>
      <div class="card-actions">
        <button type="button" class="btn btn-primary btn-sm" data-act="copy-email">Copy for email</button>
        <button type="button" class="link" data-act="rename">Rename</button>
        <button type="button" class="link danger" data-act="delete">Delete</button>
      </div>
    </div>
    <template class="email-html">${v.emailHtml}</template>
    <template class="email-text">${esc(v.emailText)}</template>
  </article>`;
}

export function libraryPage(cfg, rows) {
  const total = rows.reduce((n, r) => n + (r.duration || 0), 0);
  const summary = rows.length
    ? `${rows.length} video${rows.length === 1 ? '' : 's'}${total ? ` · ${formatDuration(total)} total` : ''}`
    : '';
  return shell({
    title: 'My videos | Vidpitch',
    body: `
<header class="top">
  <a class="brand" href="/">${LOGO}<span>Vidpitch</span></a>
  <div class="top-actions">
    <a class="btn btn-primary" href="/record">${PLUS}<span>New video</span></a>
    <a class="link muted" href="/logout">Sign out</a>
  </div>
</header>
<main class="lib">
  <div class="lib-head">
    <div>
      <h1>My videos</h1>
      <p class="sub">${esc(summary)}</p>
    </div>
    ${rows.length ? '<input class="search" type="search" placeholder="Search by title" aria-label="Search videos">' : ''}
  </div>
  ${rows.length ? `<div class="grid" id="grid">${rows.map((r) => card(cfg, r)).join('')}</div>
  <p class="empty-search" hidden>No videos match that search.</p>` : `
  <div class="empty">
    <div class="empty-art">${LOGO}</div>
    <h2>Record your first video</h2>
    <p class="sub">Your screen, your face in a bubble, and a moving preview ready for Gmail.</p>
    <a class="btn btn-primary btn-lg" href="/record">${PLUS}<span>New video</span></a>
  </div>`}
</main>
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
