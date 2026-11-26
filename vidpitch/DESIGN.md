# Vidpitch design system

Reverse engineered from Loom's live share page (Lens design system, Atlassian era, sampled Nov 2026). Values below are Loom's own tokens converted to hex.

## Type
* Family: Inter (Loom uses Atlassian Sans, which is built on Inter). Variable weights; bold is **653**, medium 500, regular 400.
* Sizes (8px unit): 12 small, 14 body, 18 large, 24 xlarge (page and video titles), 32 xxlarge (sign in headline).
* Line height 1.5 to 1.57. No serif, no eyebrow labels above headings.

## Colour (light)
| Token | Value | Use |
|---|---|---|
| `--bg` | #ffffff | surfaces |
| `--bg-2` | #f8f8f8 | video stage, sunken areas (Loom grey1) |
| `--grey2` | #f0f1f2 | hover fills |
| `--grey3` | #dddee1 | dividers, tab rules |
| `--grey5` | #8c8f97 | form borders, placeholder |
| `--dim` | #6b6e76 | secondary text (Loom grey6) |
| `--body` | #292a2e | text (Loom grey8) |
| `--border` | rgba(11,18,40,.14) | card and panel borders |
| `--hover` | rgba(5,21,36,.08) | subtle hover |
| `--primary` | #1868db | the one action colour |
| `--highlight` | rgba(24,104,219,.15) | selected nav, selection |
| `--focus` | #4688ec | focus ring |
| `--rec` | #e5484d | record and stop only |

Dark: bg #1f1f21, bg-2 #18191a, body #cecfd2, dim #96999e, border rgba(227,228,242,.12), primary #669df1, overlay #2b2c2f.

## Shape and depth
* 8px spacing unit. Radii 4 (inputs, small buttons), 8 (buttons, thumbnails), 12 (player, cards), 16 (floating bars), full (avatars, pills).
* Shadows: small `0 4px 10px rgba(0,0,0,.05)`, medium `0 4px 10px rgba(0,0,0,.1)`, large `0 6px 24px rgba(0,0,0,.1)`.

## Layout patterns (from Loom)
* Share page: 64px top bar with hairline rule; two columns: main (title row, then the video on a #f8f8f8 stage, then a white floating bar) and a 436px right sidebar with a tab rule. Sidebar stacks below on narrow screens.
* Library: left sidebar navigation, top search, "My Library" heading, grid of 16:9 thumbnail cards with duration badge and hover actions.
* Recorder: compact control panel; the camera bubble floats in the bottom corner of the page itself, like Loom's.
* Sign in: charcoal #3b3d42 page, centred bold headline, full width primary button.

## Motion
Short (150 to 250ms) ease out on hover and state changes. One authored moment: the booking card sliding onto the video near the end.
