// Puts your face in a round bubble on top of the screen recording.
//
// Why not a <canvas> with requestAnimationFrame? Once you switch to the tab
// you are recording, this recorder tab is in the background and Chrome
// pauses its animation frames and slows its timers, so the video would
// freeze. Reading frames straight from the camera track keeps running in a
// background tab, and every camera frame drives one composed output frame.
(() => {
  const supported = typeof MediaStreamTrackProcessor === 'function' && typeof MediaStreamTrackGenerator === 'function';

  const SIZES = { small: 0.2, medium: 0.27, large: 0.36 }; // share of the video height

  function composite(displayStream, camStream, { position = 'left', size = 'medium' } = {}) {
    const screenTrack = displayStream.getVideoTracks()[0];
    const camTrack = camStream.getVideoTracks()[0];
    const generator = new MediaStreamTrackGenerator({ kind: 'video' });
    const writer = generator.writable.getWriter();
    const screenReader = new MediaStreamTrackProcessor({ track: screenTrack }).readable.getReader();
    const camReader = new MediaStreamTrackProcessor({ track: camTrack }).readable.getReader();

    let running = true;
    let screenFrame = null;
    let canvas = null;
    let ctx = null;
    let lastTs = -1;

    // Keep only the newest screen frame. A still screen sends few frames,
    // which is fine because the camera sets the pace.
    (async () => {
      while (running) {
        const { value, done } = await screenReader.read().catch(() => ({ done: true }));
        if (done) break;
        if (!canvas) {
          // Fix the output size to the first frame so the file never changes size.
          const w = value.displayWidth - (value.displayWidth % 2);
          const h = value.displayHeight - (value.displayHeight % 2);
          canvas = new OffscreenCanvas(w, h);
          ctx = canvas.getContext('2d', { alpha: false });
        }
        if (screenFrame) screenFrame.close();
        screenFrame = value;
      }
    })();

    function drawBubble(cam) {
      const W = canvas.width, H = canvas.height;
      const d = Math.round(Math.min(W, H) * (SIZES[size] || SIZES.medium));
      const margin = Math.round(Math.min(W, H) * 0.035);
      const x = position === 'right' ? W - d - margin : margin;
      const y = H - d - margin;
      const r = d / 2;
      // Square crop from the middle of the camera picture, mirrored like a mirror.
      const cw = cam.displayWidth, ch = cam.displayHeight;
      const side = Math.min(cw, ch);
      const sx = (cw - side) / 2, sy = (ch - side) / 2;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = d * 0.08;
      ctx.shadowOffsetY = d * 0.02;
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(x + d, y);
      ctx.scale(-1, 1);
      ctx.drawImage(cam, sx, sy, side, side, 0, 0, d, d);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x + r, y + r, r - Math.max(2, d * 0.012), 0, Math.PI * 2);
      ctx.lineWidth = Math.max(3, d * 0.024);
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.stroke();
    }

    (async () => {
      while (running) {
        const { value: cam, done } = await camReader.read().catch(() => ({ done: true }));
        if (done) break;
        try {
          if (!canvas || !screenFrame) continue;
          if (writer.desiredSize !== null && writer.desiredSize <= 0) continue; // encoder is behind, drop
          ctx.drawImage(screenFrame, 0, 0, canvas.width, canvas.height);
          drawBubble(cam);
          const ts = Math.max(cam.timestamp, lastTs + 1);
          lastTs = ts;
          const out = new VideoFrame(canvas, { timestamp: ts });
          writer.write(out).catch(() => {});
        } finally {
          cam.close();
        }
      }
    })();

    function stop() {
      running = false;
      screenReader.cancel().catch(() => {});
      camReader.cancel().catch(() => {});
      if (screenFrame) screenFrame.close();
      screenFrame = null;
      writer.close().catch(() => {});
      generator.stop();
    }


    return { track: generator, stop };
  }

  window.VidpitchCamera = { supported, composite };
})();
