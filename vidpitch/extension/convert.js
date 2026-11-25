// Makes every recording play in Safari and on iPhone.
//
// Chrome's recorder writes a "fragmented" MP4, and on machines without an
// AAC encoder it uses Opus audio. Apple's players reject both. This rewrites
// the file in the browser with ffmpeg (WebAssembly) into a standard MP4:
// H.264 video, AAC audio, index at the front ("faststart").
//
// It always returns a video. The order of attempts:
//   1. Fast: copy the H.264 picture as is, convert only the audio. Seconds.
//   2. Full: re-encode picture and audio. Slower, works on any input.
//   3. Last resort: the original recording, so a video is never lost.
// Each result is checked with mp4check.js before it is accepted.
import { FFmpeg } from './vendor/ffmpeg/index.js';
import { checkMp4 } from './mp4check.js';

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

const IN_DIR = '/rec';
const IN_MEMORY_LIMIT = 300 * 1024 * 1024; // about 15 minutes of recording
const OUT = 'out.mp4';
const COMMON_OUT = ['-tag:v', 'avc1', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', OUT];

async function run(ff, args, duration, onProgress) {
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
    const code = await ff.exec(args);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const data = await ff.readFile(OUT);
    if (!data || !data.length) throw new Error('ffmpeg produced an empty file');
    return data;
  } finally {
    ff.off('log', onLog);
    await ff.deleteFile(OUT).catch(() => {});
  }
}

/**
 * @param {Blob} blob the recording
 * @param {string} mimeType what MediaRecorder actually used
 * @param {{ duration?: number, onProgress?: (f: number) => void, onStage?: (s: string) => void }} opts
 * @returns {Promise<{ blob: Blob, safari: boolean, notes: string[] }>}
 */
export async function toUniversalMp4(blob, mimeType, { duration = 0, onProgress, onStage } = {}) {
  const notes = [];
  const type = (mimeType || blob.type || '').toLowerCase();
  const isMp4H264 = type.startsWith('video/mp4') && (type.includes('avc1') || !type.includes('codecs'));
  const hasAac = type.includes('mp4a');
  const name = isMp4H264 ? 'in.mp4' : 'in.webm';
  const input = `${IN_DIR}/${name}`;

  let ff;
  const big = blob.size > IN_MEMORY_LIMIT;
  try {
    ff = await load();
    await ff.createDir(IN_DIR).catch(() => {});
    if (big) {
      // Long recordings: read straight from the Blob instead of copying it
      // into WebAssembly memory, so they never run out of memory. Slower.
      await ff.mount('WORKERFS', { blobs: [{ name, data: blob }] }, IN_DIR);
    } else {
      // Most recordings: copy into memory, about 4x faster.
      await ff.writeFile(input, new Uint8Array(await blob.arrayBuffer()));
    }
  } catch (err) {
    notes.push(`converter did not start: ${err.message}`);
    return { blob, safari: false, notes };
  }

  const attempt = async (label, args) => {
    try {
      const data = await run(ff, args, duration, onProgress);
      const check = checkMp4(data);
      if (check.ok) return new Blob([data], { type: 'video/mp4' });
      notes.push(`${label}: ${check.problems.join(', ')}`);
    } catch (err) {
      notes.push(`${label}: ${err.message}`);
    }
    return null;
  };

  try {
    if (isMp4H264) {
      onStage && onStage('fast');
      const out = await attempt('fast', [
        '-i', input, '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'copy',
        ...(hasAac ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k']),
        ...COMMON_OUT,
      ]);
      if (out) return { blob: out, safari: true, notes };
    }

    onStage && onStage('full');
    onProgress && onProgress(0);
    const out = await attempt('full', [
      '-i', input, '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25',
      '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      '-vf', "scale='trunc(min(1920,iw)/2)*2':-2",
      '-c:a', 'aac', '-b:a', '128k',
      ...COMMON_OUT,
    ]);
    if (out) return { blob: out, safari: true, notes };

    // Never lose a recording: hand back the original.
    return { blob, safari: false, notes };
  } finally {
    if (big) await ff.unmount(IN_DIR).catch(() => {});
    else await ff.deleteFile(input).catch(() => {});
  }
}

window.VidpitchConvert = { toUniversalMp4 };
