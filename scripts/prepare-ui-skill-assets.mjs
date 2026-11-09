import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { transform } from "esbuild";

// Maintainer tool: the installed skill itself never needs the source repository.
const base = "skills/silver-liquid-glass-ui/assets";
const sources = [
  "src/main.tsx",
  "src/explorer.css",
  "src/discovery.css",
  "src/iteration.css",
  "src/refined-theme.css",
  "src/frosted-glass.css",
  "src/liquid-refraction.css",
  "src/components/repository-card.css",
  "src/components/trend-project-card.css",
  "src/components/demand-chat.css",
  "src/components/rankings.css",
  "src/components/trials.css",
  "src/components/project-reader.css",
  "src/components/trial-showcase.css",
  "src/components/site-navigation.css",
  "src/components/discovery-hero.css",
  "src/components/GitHubPulse/pulse.css",
  "src/admin/admin.css",
  "src/admin/main.tsx",
  "src/components/GlassTabs.tsx",
  "src/components/GlassButton.tsx",
  "src/components/SiteNavigation.tsx",
  "src/components/FilterDisclosure.tsx",
  "src/components/TrialIllustration.tsx",
  "src/components/TrialCarousel.tsx",
  "src/useDropletIndicator.ts",
  "src/useGlassLight.ts",
  "src/useLiquidRefraction.ts",
  "src/liquidGlassController.ts",
  "src/vendor/liquid-glass-html/displacement.js",
  "src/vendor/liquid-glass-html/displacement.d.ts",
  "src/vendor/liquid-glass-html/LICENSE",
  "src/vendor/liquid-glass-html/Thanks.txt",
];
const manifest = {
  sourceCommit: "e26957a",
  captured: "2026-11-09",
  lineEndings: "LF",
  files: [],
};
for (const source of sources) {
  const target = `${base}/original/${source}`;
  await mkdir(dirname(target), { recursive: true });
  const bytes = Buffer.from(
    (await readFile(source, "utf8")).replace(/\r\n/g, "\n"),
  );
  await writeFile(target, bytes);
  manifest.files.push({
    path: source,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  `${base}/original/source-manifest.json`,
  JSON.stringify(manifest, null, 2),
);
await mkdir(`${base}/starter/vendor/liquid-glass-html`, { recursive: true });
for (const name of [
  "displacement.js",
  "displacement.d.ts",
  "LICENSE",
  "Thanks.txt",
]) {
  await copyFile(
    `src/vendor/liquid-glass-html/${name}`,
    `${base}/starter/vendor/liquid-glass-html/${name}`,
  );
}
// Preserve scheduling and optical math; only decouple the application selectors.
let controller = await readFile("src/liquidGlassController.ts", "utf8");
const replace = (pattern, replacement) => {
  const next = controller.replace(pattern, replacement);
  if (next === controller)
    throw new Error(`Source changed; review adaptation: ${pattern}`);
  controller = next;
};
replace(
  /const SURFACES =[\s\S]*?const SELECTOR = `\$\{SURFACES\}, \$\{CONTROLS\}`;/,
  'const SURFACES = "[data-glass-surface]";\nconst CONTROLS = "[data-glass-control]";\nconst EXCLUDED = "[data-glass-bare], [data-glass-exclude], [data-glass-exclude] *";\nconst SELECTOR = `${SURFACES}, ${CONTROLS}`;',
);
replace('node.closest(".excalidraw")', 'node.closest("[data-glass-exclude]")');
replace(
  'element.matches(".project-search, .site-header-inner")',
  'element.matches("[data-glass-strong]")',
);
const result = await transform(controller, {
  loader: "ts",
  format: "esm",
  target: "es2022",
});
await writeFile(
  `${base}/starter/LiquidGlassController.js`,
  "// Selector adaptation of the original viewport adapter. Optical renderer: MIT © 2026 NightS.\n" +
    result.code,
);
await copyFile(
  "src/useDropletIndicator.ts",
  `${base}/starter/useDropletIndicator.ts`,
);
await mkdir(`${base}/starter/fonts`, { recursive: true });
for (const [source, name] of [
  [
    "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
    "manrope-latin-wght-normal.woff2",
  ],
  ["node_modules/@fontsource-variable/manrope/LICENSE", "Manrope-OFL.txt"],
  [
    "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2",
    "instrument-serif-latin-400-normal.woff2",
  ],
  [
    "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2",
    "instrument-serif-latin-400-italic.woff2",
  ],
  [
    "node_modules/@fontsource/instrument-serif/LICENSE",
    "InstrumentSerif-OFL.txt",
  ],
])
  await copyFile(source, `${base}/starter/fonts/${name}`);
console.log(
  `Copied ${sources.length} original files with SHA-256 provenance; prepared portable optics and droplet hook.`,
);
