# Vidpitch

Record your screen, get a share link, and drop a moving GIF preview of the first 3 seconds straight into Gmail. The video page ends with a booking button that sends viewers to your calendar.

Vidpitch is a working name. Rename it whenever you like.

## What is built (phase 1: the core)

| Piece | Where | What it does |
|---|---|---|
| Recorder | `extension/` (Chrome, Manifest V3) | Records a tab, window or whole screen with your microphone, with pause, resume and discard. |
| Upload | `extension/recorder.js` and `POST /api/videos` | Sends the recording to your server with a progress bar. If the upload fails you can retry or save the file locally. |
| GIF preview | `server/src/media.js` | ffmpeg turns the first 3 seconds into a looping GIF with a play button, kept under 1 MB. Usually done in under a second. |
| Video for every browser | `server/src/media.js` | Converts Chrome's WebM to H.264 MP4 in the background, so seeking works and Safari and iPhone can play it. |
| Gmail insert | `extension/gmail.js` | One click puts the title, the GIF and a "Watch video" link into your open draft, at your cursor. It is also copied to your clipboard as a backup. |
| Copy for email | `extension/recorder.js` | Copies the same block as rich HTML for Outlook, Apple Mail or anything else. |
| Share page | `server/src/views.js`, `server/public/` | Custom player with speed, fullscreen, keyboard shortcuts and a mobile layout. Light and dark mode. |
| Booking button | `server/public/player.js` | Slides onto the video for the last 6 seconds, then a full end card asks them to book when the video finishes. A booking bar also sits under the video the whole time. |

## How the Gmail preview works

Gmail strips `<video>` and `<iframe>`, so the email holds an `<img>` of the GIF wrapped in a link to the video page. Gmail loads the GIF through its own image proxy, which means the GIF must be on a public HTTPS address with no login. That is why the server has to be deployed somewhere public (see below) before real emails will show the preview.

Older desktop Outlook on Windows shows only the first frame of a GIF. The play button is on every frame, so it still reads as a video there.

## Run it on your computer

You need Node 22.13 or newer and ffmpeg (`brew install ffmpeg` on a Mac).

```bash
cd vidpitch/server
npm install
OWNER_NAME="Your Name" BOOKING_URL="https://cal.com/you/intro" npm start
```

The first start prints an API token. Keep it for the extension.

## Load the extension

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick the `vidpitch/extension` folder.
3. The recorder opens. Enter your server address (`http://localhost:8787` locally) and the token.
4. Click the Vidpitch icon in the toolbar any time to record.

Note: while the server runs on `localhost`, the GIF will not show inside real Gmail, because Gmail cannot reach your laptop. Everything else works.

## Deploy the server

Any host that runs Docker and gives you a **persistent disk** works, for example Railway, Fly.io, Render or a small VPS. The disk matters because videos and the database live in `/data`.

1. Deploy the `vidpitch/server` folder with its `Dockerfile`.
2. Mount a volume at `/data`.
3. Set the variables from `server/.env.example`. At minimum: `PUBLIC_URL` (your HTTPS address), `API_TOKEN` (a long random string), `OWNER_NAME`, `BOOKING_URL`.
4. Put the same `PUBLIC_URL` and `API_TOKEN` into the extension settings.

## Tests

```bash
cd vidpitch/server && npm test
```

## Roadmap

* **Phase 2:** view counts and completion rates per video, plus an email to you when someone watches, and a count of booking button clicks. The player already knows when a viewer starts, how far they get and when they click to book, so this phase sends those moments to the server and stores them.
* **Phase 3:** full design pass across the share page, recorder and a dashboard of your videos.
* **Later ideas:** webcam bubble over the screen recording, trim the start and end, custom thumbnail, Cloudflare R2 storage for large libraries.
