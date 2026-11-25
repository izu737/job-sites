// Makes every recording play in Safari and on iPhone.
//
// Chrome's recorder writes a "fragmented" MP4, and on machines without an
// AAC encoder it uses Opus audio. Apple's players reject both. This rewrites
// the file in the browser with ffmpeg (WebAssembly) into a standard MP4:
// H.264 video, AAC audio, index at the front ("faststart"). The picture is
// copied as is, so it takes seconds; only the audio is re-encoded.
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
    const data = await ff.readFile('out.mp4');
    if (!data || !data.length) throw new Error('ffmpeg produced an empty file');
    return data;
  } finally {
    ff.off('log', onLog);
    await ff.deleteFile('out.mp4').catch(() => {});
  }
}

const COMMON_OUT = ['-tag:v', 'avc1', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', 'out.mp4'];

/**
 * Returns a video/mp4 Blob that is checked to play in Safari and on iPhone,
 * or throws. It never returns a file that failed the check.
 *
 * Step 1 (seconds): copy the H.264 picture, convert audio to AAC, rewrite as
 *   a standard faststart MP4.
 * Step 2 (slower, only if step 1 is impossible or fails the check): re-encode
 *   everything to H.264 + AAC.
 *
 * @param {Blob} blob the recording
 * @param {string} mimeType what MediaRecorder actually used
 * @param {{ duration?: number, onProgress?: (fraction: number) => void, onStage?: (stage: string) => void }} opts
 */
export async function toUniversalMp4(blob, mimeType, { duration = 0, onProgress, onStage } = {}) {
  const ff = await load();
  const type = (mimeType || blob.type || '').toLowerCase();
  const isMp4H264 = type.startsWith('video/mp4') && (type.includes('avc1') || !type.includes('codecs'));
  const hasAac = type.includes('mp4a');
  const input = isMp4H264 ? 'in.mp4' : 'in.webm';
  const failures = [];

  await ff.writeFile(input, new Uint8Array(await blob.arrayBuffer()));
  try {
    if (isMp4H264) {
      onStage && onStage('fast');
      try {
        const data = await run(ff, [
          '-i', input, '-map', '0:v:0', '-map', '0:a:0?',
          '-c:v', 'copy',
          ...(hasAac ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k']),
          ...COMMON_OUT,
        ], duration, onProgress);
        const check = checkMp4(data);
        if (check.ok) return new Blob([data], { type: 'video/mp4' });
        failures.push(`fast: ${check.problems.join(', ')}`);
      } catch (err) {
        failures.push(`fast: ${err.message}`);
      }
    }

    onStage && onStage('full');
    onProgress && onProgress(0);
    try {
      const data = await run(ff, [
        '-i', input, '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25',
        '-profile:v', 'main', '-pix_fmt', 'yuv420p',
        '-vf', "scale='trunc(min(1920,iw)/2)*2':-2",
        '-c:a', 'aac', '-b:a', '128k',
        ...COMMON_OUT,
      ], duration, onProgress);
      const check = checkMp4(data);
      if (check.ok) return new Blob([data], { type: 'video/mp4' });
      failures.push(`full: ${check.problems.join(', ')}`);
    } catch (err) {
      failures.push(`full: ${err.message}`);
    }
    throw new Error(`Could not make a Safari compatible video (${failures.join(' / ')})`);
  } finally {
    await ff.deleteFile(input).catch(() => {});
  }
}

window.VidpitchConvert = { toUniversalMp4 };
