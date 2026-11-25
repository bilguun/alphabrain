# AlphaBrain

Intelligence in progress.

Static site, live at [bilguun.github.io/alphabrain](https://bilguun.github.io/alphabrain/). No build step, no dependencies, no tracking.

```
index.html      markup + metadata
styles.css      layout, type, intro + signal animation
main.js         ambient field (Canvas 2D), intro timeline, hidden interaction
favicon.svg
assets/         logo (extracted from the original mark), og image, touch icon
```

## Run locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Notes

- The wordmark is the original artwork, extracted to a transparent layer from the master PNG. The red dot is rendered as a separate element at the exact sampled position and diameter so it can animate.
- Colours are sampled from the original logo: background `#040707`, accent `#ED1B49`.
- Respects `prefers-reduced-motion` (static field, no intro), pauses when the tab is hidden, caps device pixel ratio, and falls back to a plain background when Canvas is unavailable.

## Deploy

GitHub Pages → Deploy from branch → `main` / root.
