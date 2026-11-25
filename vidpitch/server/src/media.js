// Everything that touches ffmpeg lives here.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { playButtonPng } from './png.js';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

// The GIF must stay small: Gmail loads it through its image proxy and
// people open email on phones. Each attempt is smaller than the last.
const GIF_SECONDS = 3;
const GIF_TARGET_BYTES = 1024 * 1024;
const GIF_ATTEMPTS = [
  { width: 480, fps: 12, colors: 128 },
  { width: 400, fps: 10, colors: 96 },
  { width: 320, fps: 10, colors: 64 },
];

const playPng = path.join(config.dataDir, 'play.png');
if (!fs.existsSync(playPng)) fs.writeFileSync(playPng, playButtonPng(256));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(cmd)} exited with code ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`));
    });
  });
}

export async function probe(file) {
  const out = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,width,height',
    '-of', 'json', file,
  ]);
  const info = JSON.parse(out);
  const video = (info.streams || []).find((s) => s.codec_type === 'video');
  const duration = parseFloat(info.format?.duration);
  return {
    duration: Number.isFinite(duration) ? duration : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio: (info.streams || []).some((s) => s.codec_type === 'audio'),
  };
}

/** Looping GIF of the first 3 seconds with a play button in the middle. */
export async function makePreviewGif(src, outFile) {
  let last = null;
  for (const a of GIF_ATTEMPTS) {
    const badge = Math.round(a.width * 0.18);
    const filter = [
      `[0:v]fps=${a.fps},scale=${a.width}:-2:flags=lanczos,format=rgba[v]`,
      `[1:v]scale=${badge}:${badge}[p]`,
      `[v][p]overlay=(W-w)/2:(H-h)/2,split[a][b]`,
      `[a]palettegen=max_colors=${a.colors}:stats_mode=diff[pal]`,
      `[b][pal]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
    ].join(';');
    await run(FFMPEG, [
      '-y', '-v', 'error',
      '-t', String(GIF_SECONDS), '-i', src,
      '-i', playPng,
      '-filter_complex', filter,
      '-loop', '0',
      outFile,
    ]);
    last = { width: a.width, bytes: fs.statSync(outFile).size };
    if (last.bytes <= GIF_TARGET_BYTES) break;
  }
  return last;
}

async function grabFrame(src, outFile, filter) {
  for (const at of ['0.6', '0']) {
    try {
      await run(FFMPEG, ['-y', '-v', 'error', '-ss', at, '-i', src, '-i', playPng,
        '-filter_complex', filter, '-frames:v', '1', '-q:v', '3', outFile]);
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) return;
    } catch (err) {
      if (at === '0') throw err;
    }
  }
}

/** poster.jpg sits behind the player; og.jpg is the link preview image. */
export async function makeStills(src, dir) {
  await grabFrame(src, path.join(dir, 'poster.jpg'), "[0:v]scale='trunc(min(1280,iw)/2)*2':-2");
  await grabFrame(src, path.join(dir, 'og.jpg'),
    '[0:v]scale=1200:-2[v];[1:v]scale=180:180[p];[v][p]overlay=(W-w)/2:(H-h)/2');
}

/**
 * Browsers record WebM without a duration or seek index, and Safari plays
 * it badly. Re-encoding to H.264 MP4 fixes seeking and works everywhere.
 */
export async function transcodeToMp4(src, outFile) {
  const tmp = outFile + '.part.mp4';
  await run(FFMPEG, [
    '-y', '-v', 'error', '-i', src,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-vf', "scale='trunc(min(1920,iw)/2)*2':-2",
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    tmp,
  ]);
  fs.renameSync(tmp, outFile);
  return probe(outFile);
}
