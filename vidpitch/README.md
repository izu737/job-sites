# Vidpitch

Record your screen (with your face in a bubble), get a share link, and drop a moving GIF preview of the first 3 seconds straight into Gmail. The video page ends with a booking button that sends viewers to your calendar.

Vidpitch is a working name. Rename it whenever you like.

## How it is built

| Piece | Where | What it does |
|---|---|---|
| Recorder | `extension/` (Chrome, Manifest V3) | Records a tab, window or whole screen with your microphone, optional face bubble, pause, resume and discard. Records MP4 directly so Safari and iPhone can play it. |
| Face bubble | `extension/camera.js` | Your camera in a round bubble (corner and size selectable), drawn from the camera track itself so it keeps moving while you work in other tabs. |
| GIF preview | `extension/preview.js` | Built in the browser from the first 3 seconds while you record (face bubble included), with a play button, kept under 1 MB. Also makes the poster and link preview image. |
| Upload | `extension/recorder.js` | Uploads the images, then the video in 20 MB parts with a progress bar. Retry or save locally if it fails. |
| Gmail | `extension/gmail.js` | "Insert into Gmail" puts the video block at your cursor. Pasting or typing one of your video links into a draft turns it into the GIF preview automatically. |
| Backend | `worker/` (Cloudflare Worker + R2 + D1) | Stores files in R2, records in D1, serves the share page and video with seeking. Notes whether each video passes the Safari check (never rejects one). Free plan. |
| Safari guarantee | `extension/convert.js`, `mp4check.js` | Every recording is rewritten to a standard MP4 (H.264 + AAC, index at the front) and checked. If the fast conversion (seconds) does not pass, the video is fully re-encoded. A recording is never refused or lost. Recordings over 300 MB are read from disk so long videos do not run out of memory. |
| Share page | `worker/src/views.js`, `worker/public/static/` | Custom player, booking button that slides in for the last 6 seconds, end card with your booking link, light and dark mode. |

## How the Gmail preview works

Gmail strips `<video>` and `<iframe>`, so the email holds an `<img>` of the GIF wrapped in a link to the video page. Gmail loads the GIF through its own image proxy, so the GIF must be on a public HTTPS address. Older desktop Outlook on Windows shows only the first frame; the play button is on every frame so it still reads as a video.

## Deploy (Cloudflare)

One time, in the Cloudflare dashboard: enable R2, and open Workers & Pages once so you get a `workers.dev` address.

```bash
cd vidpitch/worker
npm install
npx wrangler r2 bucket create vidpitch-media
npx wrangler d1 migrations apply vidpitch --remote
npx wrangler secret put API_TOKEN
npx wrangler deploy
```

Live at https://vidpitch.izuu.workers.dev. Your name, booking link and button text are in `worker/wrangler.toml` under `[vars]`. Change them and run `npx wrangler deploy` again.

## Load the extension

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick the `vidpitch/extension` folder.
3. The recorder opens. Enter your Worker address and the API token.
4. Click the Vidpitch icon in the toolbar any time to record.

## Local development

```bash
cd vidpitch/worker
printf 'API_TOKEN=devtoken\n' > .dev.vars
npx wrangler d1 migrations apply vidpitch --local
npx wrangler dev
npm test
```

## Roadmap

* **Phase 2:** view counts and completion rates per video, booking click counts, and an email to you when someone watches.
* **Phase 3:** full design pass across the share page, recorder and a dashboard of your videos.
* **Later ideas:** trim the start and end, custom thumbnail, custom domain.
