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
  assert.equal((page.match(/href="https:\/\/cal\.com\/someone\/intro"/g) || []).length, 4);
  assert.ok(page.includes('class="endcard" hidden'));
  assert.ok(page.includes('<meta property="og:image" content="https://videos.example.com/media/AbCdEfGhJkLm/og.jpg">'));
  assert.ok(page.includes('src="https://videos.example.com/media/AbCdEfGhJkLm/video.mp4" type="video/mp4"'));
});

test('per video booking link overrides the default', () => {
  const v = serialize(cfg, { ...video, cta_url: 'https://calendly.com/other', cta_label: 'Grab 15 min' });
  assert.equal(v.cta.url, 'https://calendly.com/other');
  assert.equal(v.cta.label, 'Grab 15 min');
});
