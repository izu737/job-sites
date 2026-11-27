// Every function takes `cfg`, built per request from the Worker's settings.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** "4 sec", "1 min 38 sec": the duration chip under Loom's play button. */
export function durationWords(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const s = Math.max(1, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m ? `${m} min${s % 60 ? ` ${s % 60} sec` : ''}` : `${s} sec`;
}

/** "1 minute ago", like Loom's byline. */
export function timeAgo(iso, now = Date.now()) {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const units = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [size, name] of units) {
    const n = Math.floor(sec / size);
    if (n >= 1) return `${n} ${name}${n === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

export function urlsFor(cfg, video) {
  const media = `${cfg.publicUrl}/media/${video.id}`;
  return {
    shareUrl: `${cfg.publicUrl}/v/${video.id}`,
    gifUrl: `${media}/preview.gif`,
    posterUrl: `${media}/poster.jpg`,
    ogUrl: `${media}/og.jpg`,
    videoUrl: `${media}/video.${video.video_ext}`,
    videoType: `video/${video.video_ext}`,
  };
}

export function ctaFor(cfg, video) {
  return {
    url: video.cta_url || cfg.bookingUrl,
    label: video.cta_label || cfg.ctaLabel,
    headline: cfg.ctaHeadline,
    subtext: cfg.ctaSubtext,
  };
}

/**
 * The block that goes into Gmail. Only inline styles and plain tags, because
 * email clients strip everything else. The GIF is wrapped in the link, so a
 * click anywhere on it opens the video page.
 */
export function emailHtml(cfg, video) {
  const { shareUrl, gifUrl } = urlsFor(cfg, video);
  const width = Math.min(400, video.gif_width || 400);
  const label = 'Watch video';
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return [
    '<div>',
    `<a href="${esc(shareUrl)}" target="_blank" style="text-decoration:none;color:#111111;${font};font-size:14px;font-weight:600;line-height:20px">${esc(video.title)}</a>`,
    '<br>',
    `<a href="${esc(shareUrl)}" target="_blank" style="display:inline-block;margin-top:6px;text-decoration:none">`,
    `<img src="${esc(gifUrl)}" alt="${esc(video.title)} (click to watch)" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:1px solid #e6e6ea;border-radius:10px">`,
    '</a>',
    '<br>',
    `<a href="${esc(shareUrl)}" target="_blank" style="color:#1868db;${font};font-size:13px;font-weight:600;text-decoration:none">&#9654; ${esc(label)}</a>`,
    '</div>',
  ].join('');
}

export function emailText(cfg, video) {
  return `${video.title}: ${urlsFor(cfg, video).shareUrl}`;
}

export function serialize(cfg, video) {
  const urls = urlsFor(cfg, video);
  return {
    id: video.id,
    title: video.title,
    createdAt: video.created_at,
    duration: video.duration,
    status: video.status,
    views: Number(video.views || 0),
    shareUrl: urls.shareUrl,
    gifUrl: urls.gifUrl,
    posterUrl: urls.posterUrl,
    cta: ctaFor(cfg, video),
    emailHtml: emailHtml(cfg, video),
    emailText: emailText(cfg, video),
  };
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

const ARROW = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CAL = '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.8-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" fill="currentColor"/></svg>';
const LINK = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const GLOBE = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.8 10h14.4M10 2.8c2 2 3 4.4 3 7.2s-1 5.2-3 7.2c-2-2-3-4.4-3-7.2s1-5.2 3-7.2z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const MAIL = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="2.8" y="4.5" width="14.4" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m3.5 5.5 6.5 5 6.5-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
const SPEED = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3.3 12.5A7 7 0 1 1 10 17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m10 10 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="10" r="1.3" fill="currentColor"/></svg>';

function page({ title, head = '', body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${head}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap">
<link rel="stylesheet" href="/static/share.css">
</head>
<body>
${body}
</body>
</html>`;
}

export function sharePage(cfg, video, opts = {}) {
  const isOwner = !!opts.owner;
  const urls = urlsFor(cfg, video);
  const cta = ctaFor(cfg, video);
  const owner = cfg.ownerName;
  const date = new Date(video.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dur = formatDuration(video.duration);
  const durWords = durationWords(video.duration);
  const ago = timeAgo(video.created_at);
  const views = Number(video.views || 0);
  const ctaLink = (cls, inner) => `<a class="${cls}" href="${esc(cta.url)}" target="_blank" rel="noopener" data-cta>${inner}</a>`;

  const head = `
<meta name="description" content="${esc(`A video from ${owner}`)}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="${esc(owner)}">
<meta property="og:title" content="${esc(video.title)}">
<meta property="og:description" content="${esc(`A ${dur ? dur + ' ' : ''}video from ${owner}`)}">
<meta property="og:url" content="${esc(urls.shareUrl)}">
<meta property="og:image" content="${esc(urls.ogUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(urls.ogUrl)}">
<meta name="robots" content="noindex">`;

  const body = `
<header class="top">
  <div class="top-inner">
    ${isOwner
      ? `<a class="brand" href="/" title="My Library"><img src="/app/icons/icon48.png" alt="" width="28" height="28"><span>Vidpitch</span></a>
    <div class="top-actions">
      <div class="split">
        <button type="button" class="split-main" data-share-open aria-haspopup="dialog" aria-expanded="false">${GLOBE}<span>Share</span></button>
        <button type="button" class="split-link" data-copy-link title="Copy link" aria-label="Copy link">${LINK}</button>
      </div>
      <a class="avatar" href="/" title="My Library">${esc(initials(owner))}</a>
      <div class="share-pop" id="share-pop" role="dialog" aria-label="Share this video" hidden>
        <p class="share-pop-title">Share this video</p>
        <button type="button" class="btn btn-primary btn-block" data-copy-link>${LINK}<span>Copy link</span></button>
        <button type="button" class="btn btn-quiet btn-block" data-copy-email>${MAIL}<span>Copy for email (with GIF)</span></button>
        <p class="share-pop-hint">With the Vidpitch extension, paste the link into Gmail and it turns into the moving preview.</p>
      </div>
    </div>`
      : `<div class="who"><span class="avatar">${esc(initials(owner))}</span><span class="who-name">${esc(owner)}</span></div>`}
  </div>
</header>

<div class="layout">
  <main class="main">
    <div class="title-row">
      <div class="title-text">
        <h1${isOwner ? ' class="editable" data-edit-title tabindex="0" title="Click to rename"' : ''}>${esc(video.title)}</h1>
        <p class="byline"><span>${esc(owner)}</span><span class="sep" aria-hidden="true">·</span><span title="${esc(date)}">${esc(ago)}</span></p>
      </div>
      <div class="title-actions">
        ${isOwner ? `<span class="views-pill">${views} view${views === 1 ? '' : 's'}</span>` : ''}
        ${isOwner ? '' : `<button type="button" class="icon-btn" data-copy-link aria-label="Copy link to this video" title="Copy link"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>`}
      </div>
    </div>

    <div class="stage">
      <div class="player" id="player" tabindex="-1"
           data-duration="${esc(video.duration ?? '')}"
           data-cta-lead="${esc(cfg.ctaLeadSeconds)}">
        <video id="video" playsinline preload="metadata" poster="${esc(urls.posterUrl)}">
          <source src="${esc(urls.videoUrl)}" type="${esc(urls.videoType)}">
        </video>

        <div class="play-wrap">
          <button class="bigplay" type="button" aria-label="Play video">${PLAY}</button>
          ${durWords ? `<button class="play-chip" type="button" data-chip-speed aria-label="Playback speed"><span class="chip-speed">${SPEED}<b data-chip-speed-text>1×</b></span><span class="chip-dur">${esc(durWords)}</span></button>` : ''}
        </div>

        ${cta.url ? ctaLink('cta-pop', `<span class="cta-pop-icon">${CAL}</span><span class="cta-pop-text"><strong>${esc(cta.label)}</strong><small>with ${esc(owner)}</small></span><span class="cta-pop-arrow">${ARROW}</span>`) : ''}

        <div class="endcard" hidden>
          <div class="endcard-inner">
            ${cta.url ? `
            <span class="avatar avatar-lg">${esc(initials(owner))}</span>
            <h2>${esc(cta.headline)}</h2>
            <p>${esc(cta.subtext)}</p>
            ${ctaLink('btn btn-primary btn-lg', `${CAL}<span>${esc(cta.label)}</span>${ARROW}`)}
            ` : '<h2>Thanks for watching</h2>'}
            <button class="replay" type="button">
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5v3.2h3.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Watch again
            </button>
          </div>
        </div>

        <div class="controls">
          <div class="scrub" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
            <div class="scrub-track"><div class="scrub-buffer"></div><div class="scrub-fill"></div></div>
          </div>
          <div class="bar">
            <button type="button" class="ctl" data-act="play" aria-label="Play">
              <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>
              <svg class="i-pause" viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>
            </button>
            <button type="button" class="ctl" data-act="mute" aria-label="Mute">
              <svg class="i-vol" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 8.5a4.5 4.5 0 0 1 0 7M18 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              <svg class="i-mute" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
            </button>
            <span class="time"><span data-cur>0:00</span><span class="sep">/</span><span data-dur>${esc(dur || '0:00')}</span></span>
            <span class="grow"></span>
            <button type="button" class="ctl ctl-text" data-act="speed" aria-label="Playback speed">1x</button>
            <button type="button" class="ctl" data-act="fullscreen" aria-label="Full screen">
              <svg viewBox="0 0 24 24"><path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>
      ${cta.url ? `
      <div class="cta-strip">
        <span class="avatar">${esc(initials(owner))}</span>
        <div class="cta-strip-copy">
          <strong>${esc(cta.headline)}</strong>
          <span>${esc(cta.subtext)}</span>
        </div>
        ${ctaLink('btn btn-primary', `${CAL}<span>${esc(cta.label)}</span>`)}
      </div>` : ''}
    </div>
  </main>

  ${isOwner ? `
  <aside class="side">
    <div class="tabs" role="tablist">
      <button type="button" class="tab on" role="tab" aria-selected="true" data-tab="share">Share</button>
      <button type="button" class="tab" role="tab" aria-selected="false" data-tab="settings">Settings</button>
    </div>
    <div class="side-body" data-panel="share">
      <div class="side-section">
        <h2>Send it</h2>
        <p class="side-note">This is how it lands in their inbox.</p>
        <img class="email-gif" src="${esc(urls.gifUrl)}" alt="Email preview: the first 3 seconds of your video">
        <button type="button" class="btn btn-primary btn-block" data-copy-email>${MAIL}<span>Copy for email</span></button>
        <button type="button" class="btn btn-quiet btn-block" data-copy-link>${LINK}<span>Copy link</span></button>
        <p class="side-note">With the Vidpitch extension, paste the link into Gmail and it turns into the moving preview.</p>
      </div>
      <div class="side-section stat">
        <span class="stat-num">${views}</span><span class="stat-label">view${views === 1 ? '' : 's'} so far</span>
      </div>
    </div>
    <div class="side-body" data-panel="settings" hidden>
      <form class="side-section" data-cta-form>
        <h2>Booking button</h2>
        <p class="side-note">Shown near the end of the video and under it.</p>
        <label class="field"><span>Booking link</span><input name="ctaUrl" type="url" value="${esc(video.cta_url || '')}" placeholder="${esc(cfg.bookingUrl || 'https://calendly.com/you')}"></label>
        <label class="field"><span>Button text</span><input name="ctaLabel" type="text" maxlength="60" value="${esc(video.cta_label || '')}" placeholder="${esc(cfg.ctaLabel)}"></label>
        <button type="submit" class="btn btn-primary">Save</button>
      </form>
      <div class="side-section">
        <h2>Delete video</h2>
        <p class="side-note">The link stops working for anyone you sent it to.</p>
        <button type="button" class="btn btn-danger" data-delete>Delete video</button>
      </div>
    </div>
  </aside>
  <template id="email-html">${opts.emailHtml || ''}</template>
  <template id="email-text">${esc(opts.emailText || '')}</template>` : `
  <aside class="side">
    <div class="tabs" role="presentation"><span class="tab on">About</span></div>
    <div class="side-body">
      <div class="creator">
        <span class="avatar avatar-md">${esc(initials(owner))}</span>
        <div class="creator-text"><b>${esc(owner)}</b><span>${esc(date)}${dur ? ` · ${esc(dur)}` : ''}</span></div>
      </div>
      ${cta.url ? `
      <div class="book-card">
        <h2>${esc(cta.headline)}</h2>
        <p>${esc(cta.subtext)}</p>
        ${ctaLink('btn btn-primary btn-block', `${CAL}<span>${esc(cta.label)}</span>`)}
      </div>` : ''}
    </div>
  </aside>`}
</div>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<div id="vp-meta" data-id="${esc(video.id)}" data-share-url="${esc(urls.shareUrl)}" data-new="${opts.justRecorded ? '1' : ''}" hidden></div>
<script src="/static/player.js" defer></script>
${isOwner ? `<script src="/static/owner.js" defer></script>` : ''}`;

  return page({ title: `${video.title} | ${owner}`, head, body });
}

export function messagePage(heading, text, status = 404) {
  return {
    status,
    html: page({
      title: heading,
      body: `<main class="wrap wrap-msg"><div class="msg"><h1>${esc(heading)}</h1><p>${esc(text)}</p></div></main>`,
    }),
  };
}
