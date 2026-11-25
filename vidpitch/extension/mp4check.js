// Checks that an MP4 will play in Safari and on iPhone.
// The same file lives in extension/mp4check.js and worker/src/mp4check.js;
// keep them identical.
//
// Apple's players need:
//   * H.264 video (avc1)            not HEVC hev1, VP9 or AV1
//   * AAC audio (mp4a) or no audio  not Opus or FLAC
//   * a normal MP4                  not fragmented (no mvex/moof)
//   * the index (moov) before the media data (mdat), so playback can start
//     before the whole file has downloaded

const ascii = (bytes, at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

/** Reads one box header at `offset`. Returns null if it does not fit. */
export function readBoxHeader(bytes, offset = 0) {
  if (offset + 8 > bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size = view.getUint32(offset);
  const type = ascii(bytes, offset + 4);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > bytes.length) return null;
    size = Number(view.getBigUint64(offset + 8));
    headerSize = 16;
  }
  return { type, size, headerSize };
}

function contains(bytes, text) {
  const t0 = text.charCodeAt(0), t1 = text.charCodeAt(1), t2 = text.charCodeAt(2), t3 = text.charCodeAt(3);
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === t0 && bytes[i + 1] === t1 && bytes[i + 2] === t2 && bytes[i + 3] === t3) return true;
  }
  return false;
}

/** Looks inside the moov box for the codecs and for fragmentation. */
export function scanMoov(moov) {
  const video = ['avc1', 'avc3', 'hvc1', 'hev1', 'vp09', 'av01'].find((c) => contains(moov, c)) || null;
  const audio = ['mp4a', 'Opus', 'fLaC', 'ac-3'].find((c) => contains(moov, c)) || null;
  return { video, audio, fragmented: contains(moov, 'mvex') };
}

/**
 * Judges the layout and codecs.
 * @param {{ order: string[], moov: Uint8Array|null }} info top level box types in order, and the moov bytes
 */
export function verdict({ order, moov }) {
  const problems = [];
  const moovAt = order.indexOf('moov');
  const mdatAt = order.indexOf('mdat');
  if (moovAt === -1) problems.push('no index (moov) found');
  if (order.includes('moof')) problems.push('fragmented file (moof)');
  if (moovAt !== -1 && mdatAt !== -1 && mdatAt < moovAt) problems.push('index is after the media (not faststart)');
  let codecs = { video: null, audio: null, fragmented: false };
  if (moov) {
    codecs = scanMoov(moov);
    if (codecs.fragmented) problems.push('fragmented file (mvex)');
    if (codecs.video !== 'avc1') problems.push(`video codec ${codecs.video || 'missing'} (needs H.264 avc1)`);
    if (codecs.audio && codecs.audio !== 'mp4a') problems.push(`audio codec ${codecs.audio} (needs AAC)`);
  }
  return { ok: problems.length === 0, problems, ...codecs };
}

/** Whole file in memory (the extension has it). */
export function checkMp4(bytes) {
  const order = [];
  let moov = null;
  let offset = 0;
  while (offset < bytes.length && order.length < 64) {
    const box = readBoxHeader(bytes, offset);
    if (!box || box.size < 8) break;
    order.push(box.type);
    if (box.type === 'moov') moov = bytes.subarray(offset, Math.min(bytes.length, offset + box.size));
    offset += box.size;
  }
  return verdict({ order, moov });
}
