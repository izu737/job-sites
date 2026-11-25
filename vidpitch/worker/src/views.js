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
  const dur = formatDuration(video.duration);
  const label = `Watch video${dur ? ` (${dur})` : ''}`;
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return [
    '<div>',
    `<a href="${esc(shareUrl)}" target="_blank" style="text-decoration:none;color:#111111;${font};font-size:14px;font-weight:600;line-height:20px">${esc(video.title)}</a>`,
    '<br>',
    `<a href="${esc(shareUrl)}" target="_blank" style="display:inline-block;margin-top:6px;text-decoration:none">`,
    `<img src="${esc(gifUrl)}" alt="${esc(video.title)} (click to watch)" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:1px solid #e6e6ea;border-radius:10px">`,
    '</a>',
    '<br>',
    `<a href="${esc(shareUrl)}" target="_blank" style="color:#5b4bff;${font};font-size:13px;font-weight:600;text-decoration:none">&#9654; ${esc(label)}</a>`,
    '</div>',
  ].join('');
}

export function emailText(cfg, video) {
  const dur = formatDuration(video.duration);
  return `${video.title}${dur ? ` (${dur})` : ''}: ${urlsFor(cfg, video).shareUrl}`;
}

export function serialize(cfg, video) {
  const urls = urlsFor(cfg, video);
  return {
    id: video.id,
    title: video.title,
    createdAt: video.created_at,
    duration: video.duration,
    status: video.status,
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
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';

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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/static/share.css">
</head>
<body>
${body}
</body>
</html>`;
}

export function sharePage(cfg, video) {
  const urls = urlsFor(cfg, video);
  const cta = ctaFor(cfg, video);
  const owner = cfg.ownerName;
  const date = new Date(video.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dur = formatDuration(video.duration);
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
  <div class="who"><span class="avatar">${esc(initials(owner))}</span><span class="who-name">${esc(owner)}</span></div>
  ${cta.url ? ctaLink('btn btn-quiet', `${CAL}<span>${esc(cta.label)}</span>`) : ''}
</header>

<main class="wrap">
  <div class="player" id="player" tabindex="-1"
       data-duration="${esc(video.duration ?? '')}"
       data-cta-lead="${esc(cfg.ctaLeadSeconds)}">
    <video id="video" playsinline preload="metadata" poster="${esc(urls.posterUrl)}">
      <source src="${esc(urls.videoUrl)}" type="${esc(urls.videoType)}">
    </video>

    <button class="bigplay" type="button" aria-label="Play video">${PLAY}</button>

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

  <section class="meta">
    <h1>${esc(video.title)}</h1>
    <p><span>${esc(owner)}</span><span class="dot"></span><span>${esc(date)}</span>${dur ? `<span class="dot"></span><span>${esc(dur)}</span>` : ''}</p>
  </section>

  ${cta.url ? `
  <section class="cta-strip">
    <span class="avatar">${esc(initials(owner))}</span>
    <div class="cta-strip-copy">
      <strong>${esc(cta.headline)}</strong>
      <span>${esc(cta.subtext)}</span>
    </div>
    ${ctaLink('btn btn-primary', `<span>${esc(cta.label)}</span>${ARROW}`)}
  </section>` : ''}
</main>
<script src="/static/player.js" defer></script>`;

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
