import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const port = Number(process.env.PORT || 8787);
const dataDir = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

// The extension proves it is you with this token. If you do not set one,
// a random token is created once and kept in the data folder.
function resolveApiToken() {
  if (process.env.API_TOKEN) return process.env.API_TOKEN.trim();
  const file = path.join(dataDir, 'api-token.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const token = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(file, token + '\n', { mode: 0o600 });
  return token;
}

function cleanUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export const config = {
  port,
  dataDir,
  videosDir: path.join(dataDir, 'videos'),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  apiToken: resolveApiToken(),
  ownerName: process.env.OWNER_NAME || 'Your Name',
  bookingUrl: cleanUrl(process.env.BOOKING_URL),
  ctaLabel: process.env.CTA_LABEL || 'Book a call',
  ctaHeadline: process.env.CTA_HEADLINE || 'Want to talk this through?',
  ctaSubtext: process.env.CTA_SUBTEXT || 'Pick a time that works for you. It takes 10 seconds.',
  // The booking button slides onto the video this many seconds before the end.
  ctaLeadSeconds: Number(process.env.CTA_LEAD_SECONDS || 6),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 1024) * 1024 * 1024,
};

fs.mkdirSync(config.videosDir, { recursive: true });

export { cleanUrl };
