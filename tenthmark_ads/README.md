# Tenthmark ad engine

Step 1 of the creative pipeline: saved ad formats as templates, fed with variables, rendered as every combination.

| File | Role |
| --- | --- |
| `brand.mjs` | Colors, fonts, proof points, wordmark |
| `art.mjs` | Seeded hero artwork (replaces the Stripe gradient) |
| `templates/proof_card.mjs` | Headline plus product proof card (Stripe "minutes, not days") |
| `templates/split_editorial.mjs` | Art on top, white panel below (Stripe "Créez votre société") |
| `templates/phone_chat.mjs` | Phone mockup with chat card (Stripe "Create a link. Sell anywhere.") |
| `angles.json` | The variables. One entry per angle, filling every template |
| `out/` | Rendered 1080x1080 PNGs and `sheet.png` contact sheet |

Render:

```
NODE_PATH=/opt/node-tools/node_modules node render.mjs            # everything
NODE_PATH=/opt/node-tools/node_modules node render.mjs speed      # one angle
```
