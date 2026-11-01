# Retained third-party source

**Lens Design System 1.1.0-showcase.1** — Copyright (c) 2026 DayDreamInAReverie.

Source: https://github.com/ruiqichenbiec/design-systems/tree/main/lens/lab/design-system

MIT-licensed material tokens, component styles, spring controller and WebGL renderer are retained in `src/vendor/lens/` from the previous interface. The current gallery theme does not import these materials, adapters or renderer. The license remains in that folder and is distributed as `public/licenses/lens-MIT.txt`.

Package dependencies retain their respective licenses in their distributions.

**Liquid-Glass-HTML** — Copyright (c) 2026 NightS.

Source: https://github.com/Weiqin-Mo/Liquid-Glass-HTML

Pinned commit: `c6810701752f20098137cd719300dc8b6aa02d3f`.

The original rounded-rectangle SDF displacement algorithm is extracted from `Liquid-Glass index.html` into `src/vendor/liquid-glass-html/displacement.js` and actively used by the site. Its math is unchanged. The SVG filter and material styles are adapted for React, visibility scheduling, bounded raster sizes and cache retention, lifecycle cleanup, light/dark themes, and accessibility preferences. The original MIT license and shader acknowledgment are retained in that directory; the license is also distributed as `public/licenses/liquid-glass-html-MIT.txt`.

The upstream project credits Wood Chen's shader ideas: https://www.sunai.net/t/topic/1381.
