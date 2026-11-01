# Liquid-Glass-HTML

Source: https://github.com/Weiqin-Mo/Liquid-Glass-HTML
Commit: `c6810701752f20098137cd719300dc8b6aa02d3f`
License: MIT, copyright (c) 2026 NightS. See LICENSE and Thanks.txt.

`displacement.js` contains `smoothStep`, `roundedRectSDF`, and `buildDisplacementMap` extracted from the upstream `Liquid-Glass index.html`. Apart from module export, indentation, formatting, and attribution, the computation is unchanged.

The host adapter is `src/liquidGlassController.ts`. It uses the same `feImage → feDisplacementMap → backdrop-filter` pipeline. Adaptations: only visible surfaces are rasterized, large maps use at most 512px / 131,072 pixels, identical shapes reuse filters, unused cache entries are bounded, viewport clamping is refreshed after scrolling settles, and all observers/styles/SVG nodes are cleaned up on unmount. Theme and layout remain site-owned. No upstream demo controls or global state are imported.

Chromium receives displacement filters. Other engines retain the site's blur-based material because URL backdrop-filter rendering differs. Reduced transparency disables displacement and clears maps; reduced motion keeps the static optical surface without press animation or pointer lighting.
