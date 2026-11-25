// Makes every recording play in Safari and on iPhone.
//
// Chrome's recorder writes a "fragmented" MP4, and on machines without an
// AAC encoder it uses Opus audio. Apple's players reject both. This rewrites
// the file in the browser with ffmpeg (WebAssembly) into a standard MP4:
// H.264 video, AAC audio, index at the front ("faststart"). The picture is
// copied as is, so it takes seconds; only the audio is re-encoded.
import { FFmpeg } from './vendor/ffmpeg/index.js';

let ffmpeg = null;

async function load() {
  if (ffmpeg) return ffmpeg;
  const ff = new FFmpeg();
  await ff.load({
    coreURL: chrome.runtime.getURL('vendor/ffmpeg-core/ffmpeg-core.js'),
    wasmURL: chrome.runtime.getURL('vendor/ffmpeg-core/ffmpeg-core.wasm'),
  });
  ffmpeg = ff;
  return ff;
}

/**
 * @param {Blob} blob the recording
 * @param {string} mimeType what MediaRecorder actually used
 * @param {{ duration?: number, onProgress?: (fraction: number) => void }} opts
 * @returns {Promise<Blob>} video/mp4
 */
export async function toUniversalMp4(blob, mimeType, { duration = 0, onProgress } = {}) {
  const ff = await load();
  const type = (mimeType || blob.type || '').toLowerCase();
  const isMp4H264 = type.startsWith('video/mp4') && (type.includes('avc1') || !type.includes('codecs'));
  const hasAac = type.includes('mp4a');
  const input = isMp4H264 ? 'in.mp4' : 'in.webm';

  const onLog = ({ message }) => {
    // "time=00:00:12.34" in ffmpeg's status line tells us how far it got.
    const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(message);
    if (m && duration > 0 && onProgress) {
      const t = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
      onProgress(Math.min(1, t / duration));
    }
  };
  ff.on('log', onLog);

  try {
    await ff.writeFile(input, new Uint8Array(await blob.arrayBuffer()));
    const video = isMp4H264
      ? ['-c:v', 'copy']
      // Older Chrome records WebM (VP8/VP9); that needs a real re-encode.
      : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p'];
    const audio = hasAac ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k'];
    const code = await ff.exec([
      '-i', input,
      '-map', '0:v:0', '-map', '0:a:0?',
      ...video, ...audio,
      '-tag:v', 'avc1',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      'out.mp4',
    ]);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const data = await ff.readFile('out.mp4');
    if (!data || !data.length) throw new Error('ffmpeg produced an empty file');
    onProgress && onProgress(1);
    return new Blob([data], { type: 'video/mp4' });
  } finally {
    ff.off('log', onLog);
    for (const f of [input, 'out.mp4']) await ff.deleteFile(f).catch(() => {});
  }
}

window.VidpitchConvert = { toUniversalMp4 };
