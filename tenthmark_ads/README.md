# Tenthmark ad engine

Creative pipeline: saved ad formats (presets) x copy variables (angles) x background seeds, rendered in bulk.

| Path | Role |
| --- | --- |
| `studio/engine.js` | The one engine. Gradient styles, layouts, widgets, logo. Used by the studio and the renderer |
| `studio/index.html` | Ad Studio: sliders, drag to place, save presets (published as an Artifact) |
| `studio/render_page.html` | Blank page the bulk renderer loads the engine into |
| `presets/*.json` | Concrete presets to render. Paste studio exports here |
| `angles.json` | Copy variables. One entry per angle, every slot filled |
| `render.mjs` | Bulk renderer: every preset x every angle x N seeds |
| `out/` | Rendered PNGs and `sheet.png` contact sheet |

Background styles: silk, fold, mesh, ribbon, aurora, conic, linear. Every style takes the same controls (seed, palette, detail, spread, light, rotate, zoom, shift, flips, softness, fluted glass, grading, grain, vignette).

```
NODE_PATH=/opt/node-tools/node_modules node render.mjs                    # all presets x all angles
NODE_PATH=/opt/node-tools/node_modules node render.mjs --seeds 6 --flips  # 12 background variations each
NODE_PATH=/opt/node-tools/node_modules node render.mjs --preset proof_card --angle speed
```
