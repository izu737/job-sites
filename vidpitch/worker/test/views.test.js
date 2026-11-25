import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailHtml, formatDuration, sharePage, serialize } from '../src/views.js';

const cfg = {
  publicUrl: 'https://videos.example.com', ownerName: 'Izuu', bookingUrl: 'https://cal.com/someone/intro',
  ctaLabel: 'Book a call', ctaHeadline: 'Want to talk?', ctaSubtext: 'Pick a time.', ctaLeadSeconds: 6,
};
const video = {
  id: 'AbCdEfGhJkLm', title: 'Idea for <Acme> & "you"', created_at: '2026-11-25T10:00:00Z',
  duration: 83.4, gif_width: 480, video_ext: 'mp4', status: 'ready', cta_url: null, cta_label: null,
};

test('formats durations', () => {
  assert.equal(formatDuration(83.4), '1:23');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(formatDuration(null), '');
});

test('email block links the GIF to the share page and escapes the title', () => {
  const html = emailHtml(cfg, video);
  assert.match(html, /<a href="https:\/\/videos\.example\.com\/v\/AbCdEfGhJkLm"[^>]*><img src="https:\/\/videos\.example\.com\/media\/AbCdEfGhJkLm\/preview\.gif"/);
  assert.ok(html.includes('Idea for &lt;Acme&gt; &amp; &quot;you&quot;'));
  assert.ok(!html.includes('<Acme>'));
  assert.ok(html.includes('width="400"'));
  assert.ok(html.includes('Watch video (1:23)'));
});

test('share page has the booking button, end card and preview tags', () => {
  const page = sharePage(cfg, video);
  assert.equal((page.match(/href="https:\/\/cal\.com\/someone\/intro"/g) || []).length, 3); // slide in card, end card, bar under the video
  assert.ok(page.includes('class="endcard" hidden'));
  assert.ok(page.includes('<meta property="og:image" content="https://videos.example.com/media/AbCdEfGhJkLm/og.jpg">'));
  assert.ok(page.includes('src="https://videos.example.com/media/AbCdEfGhJkLm/video.mp4" type="video/mp4"'));
});

test('per video booking link overrides the default', () => {
  const v = serialize(cfg, { ...video, cta_url: 'https://calendly.com/other', cta_label: 'Grab 15 min' });
  assert.equal(v.cta.url, 'https://calendly.com/other');
  assert.equal(v.cta.label, 'Grab 15 min');
});

import { checkMp4 } from '../src/mp4check.js';

function box(type, payload = new Uint8Array(0)) {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(payload, 8);
  return out;
}
const cat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const moovWith = (...codecs) => box('moov', cat(...codecs.map((c) => box(c))));

test('Safari check accepts H.264 + AAC faststart', () => {
  assert.equal(checkMp4(cat(box('ftyp'), moovWith('avc1', 'mp4a'), box('mdat'))).ok, true);
  assert.equal(checkMp4(cat(box('ftyp'), moovWith('avc1'), box('mdat'))).ok, true); // no audio is fine
});

test('Safari check rejects everything Apple cannot play', () => {
  const bad = {
    opus: cat(box('ftyp'), moovWith('avc1', 'Opus'), box('mdat')),
    hevc_hev1: cat(box('ftyp'), moovWith('hev1', 'mp4a'), box('mdat')),
    vp9: cat(box('ftyp'), moovWith('vp09', 'mp4a'), box('mdat')),
    fragmented: cat(box('ftyp'), moovWith('avc1', 'mp4a', 'mvex'), box('moof'), box('mdat')),
    index_at_end: cat(box('ftyp'), box('mdat'), moovWith('avc1', 'mp4a')),
    no_index: cat(box('ftyp'), box('mdat')),
  };
  for (const [name, bytes] of Object.entries(bad)) assert.equal(checkMp4(bytes).ok, false, name);
});
