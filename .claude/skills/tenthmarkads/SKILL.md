---
name: tenthmarkads
description: Tenthmark creative pipeline. Turns saved ad looks from the Tenthmark Ad Studio plus copy variables (niche, offer, angle) into batches of finished 1080px ad PNGs, screens them automatically, and hands back a contact sheet for review. Use whenever the user wants Tenthmark ads, ad variants, creative for a niche or offer, a new campaign batch, or to render presets from the studio.
---

# Tenthmark creative pipeline

Four steps, matching the pipeline the user designed:
1. Saved formats become templates (presets from the Ad Studio)
2. Feed in variables (niche, offer, angle) as copy
3. Generate every combination
4. The human reviews, picks and ships. Taste stays at the end.

Everything lives in `tenthmark_ads/`. Run commands from that folder with
`NODE_PATH=/opt/node-tools/node_modules` set (Playwright lives there in this environment).

| Thing | Where |
| --- | --- |
| Ad Studio (sliders, drag to place, saved presets) | https://claude.ai/artifact/BFzotaFaJVhHwop5kGkp6R |
| Engine shared by studio and renderer | `studio/engine.js` |
| Render ready presets | `presets/*.json` |
| Copy variables | `angles.json` (core) and `angles/<campaign>.json` |
| Renderer | `render.mjs` |
| Output | `out/<run>/` with PNGs, `sheet.png`, `report.json` |

## Step 1. Pull the approved looks from the studio

The user saves looks in the studio's Presets tab. They are stored in the page's
database collection `presets`.

1. Download them with the `ArtifactData` tool: `action: "list"`, `url` = the studio URL above,
   `collection: "presets"`, `out_dir` = a fresh folder in the scratchpad.
2. Convert: `node pull_presets.mjs <that folder> --clean`
   * `--clean` makes `presets/` match the studio exactly. Leave it off to add to what is there.
   * Presets whose id starts with `starter_` are skipped unless `--starters` is passed.
3. Tell the user which presets were imported (the script prints name, layout, style, seed).

If the user wants a look changed, they change it in the studio and save again. Do not hand edit
preset JSON unless they ask; the studio is the source of truth for looks.

## Step 2. Write the variables

Ask for anything missing before writing: niches, offers (the call to action), angles, and any
real client results to use in the cards. Then write `angles/<campaign>.json`:

```json
{ "angles": [ {
  "id": "devtools_leads",            // unique, lowercase, underscores; becomes part of file names
  "niche": "devtools", "offer": "book a call", "angle": "speed",   // for the record, not rendered
  "headline": "...",                 // proof card layout
  "headline_short": "Line one.\nLine two.",   // phone layout, two short sentences
  "headline_split": "line\nline\nline",       // editorial layout, three lines
  "cta": "Book a call",
  "toast": "Sent to founder!",
  "card":  { "title": "...", "status": "ready", "bars": [22, 34, 30, 52], "item": "Bottleneck: ...", "meta": "...", "metricLabel": "...", "metric": "4 → 11" },
  "phone": { "label": "...", "current": 14, "target": 20, "title": "...", "sub": "..." }
} ] }
```

Fill every slot even if the current presets only use some, so any layout can use any angle.
A combination grid (niche x offer x angle) is the normal way to build the list.

Copy rules:
* Lengths that fit: `headline` 50 characters or fewer; each line of `headline_short` and
  `headline_split` 22 characters or fewer; `cta` 18 or fewer; `toast` 40 or fewer.
* No hyphens or dashes anywhere in ad copy (house style). Write "follow up", "in house", "AI powered" as two words or rephrase.
* Plain, specific, founder facing language. Avoid "It's not X, it's Y" constructions and stacked negations.
* Real proof only: $56,000 added revenue across clients; startups backed by Y Combinator and
  Sequoia Capital; a creator with over 150K followers; the promise of 0 to 20 users in 60 days
  without an in house marketing team; weekly reports covering bottleneck, builds, results and next week.
* Card and phone numbers must be real client results. If the user has not supplied any, keep
  placeholders and say clearly in the reply that they are placeholders and must not run.
* Never use other companies' logos or names as branding. Backer names appear only as text.

## Step 3. Generate every combination

```
node render.mjs --angles angles/<campaign>.json --seeds 3 --flips --jitter 0.5 --out <campaign>
```

* Count before running: presets x angles x seeds x (2 if `--flips`). Tell the user the number.
  About 0.5 seconds per ad, so 1,000 ads take roughly 8 minutes.
* `--seeds N` changes the background shape. `--jitter 0 to 1` also varies rotation, zoom and
  position for seeds after the first; 0.3 to 0.6 keeps the user's look while making each ad
  distinct. Without jitter, seeds of the same style can look nearly identical.
* `--flips` mirrors the background. Check the report: on some presets a flip moves bright
  areas behind white text.
* Narrow with `--preset <id>` or `--angle <id>` for quick tests.

## Step 4. Screen, then hand over for review

1. Read `out/<run>/report.json`. Each ad lists `warnings`:
   * `overlaps` or `runs off the canvas`: copy too long for the slot. Shorten the copy and rerender.
   * `hard to read`: text sits on a background too close to its colour. Drop those ads, or rerun
     without `--flips`, or ask the user to move the element or darken the art in the studio.
   Summarise the counts and the cause; do not silently delete flagged files.
2. Look at `out/<run>/sheet.png` yourself before sending. Flagged ads have a red outline.
3. Send the sheet to the user (SendUserFile, display render) with a short summary: how many
   ads, how many flagged and why, and any placeholder copy.
4. The user picks. Copy their picks into `out/<run>/picked/` and report the file paths.
5. Commit the campaign file, presets and picked ads, and push to the working branch.

## Rendering one off ads by hand

Any preset and copy can be rendered from code through the engine:
`TM.renderAd(rootElement, TM.normalize(preset), angle)` on `studio/render_page.html`.
