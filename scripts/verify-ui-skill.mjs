import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

const output = ".build/ui-skill";
await mkdir(output, { recursive: true });
const starter = "skills/silver-liquid-glass-ui/assets/starter";
const fixture = `
import React, { useRef, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GlassButton, GlassTabs } from '../../${starter}/GlassPrimitives';
import { usePersistentMenu } from '../../${starter}/usePersistentMenu';
import { useGlassEffects } from '../../${starter}/useGlassEffects';
import { useDropletIndicator } from '../../${starter}/useDropletIndicator';
import '../../${starter}/silver-glass.css';
function Fixture() {
 const root = useRef(null), header = useRef(null), trigger = useRef(null), nav = useRef(null), droplet = useRef(null);
 const { open, setOpen, mobile } = usePersistentMenu(header, trigger);
 const [selected,setSelected] = useState(location.hash.slice(1) || 'one');
 const [tab,setTab] = useState('all');
 useGlassEffects(root);
 useDropletIndicator(nav,droplet,selected+':'+open+':'+mobile);
 useEffect(()=>{const sync=()=>setSelected(location.hash.slice(1)||'one');window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
 return <div ref={root} className="sg-shell">
  <header ref={header} className="sg-header"><div className="sg-header-inner sg-surface" data-glass-surface data-glass-strong>
   <a href="#one" className="sg-brand">灵感工作台</a>
   <nav ref={nav} className="sg-navigation" id="fixture-nav" data-open={open} inert={mobile&&!open} aria-hidden={mobile&&!open?true:undefined} aria-label="主导航">
    <span ref={droplet} className="sg-droplet" data-glass-surface aria-hidden="true"/>
    {['one','two','three','four'].map((id,i)=><a key={id} href={'#'+id} aria-current={id===selected?'page':undefined}>{['发现灵感','趋势观察','动手体验','我的收藏'][i]}</a>)}
   </nav>
   <div className="sg-tools"><button type="button" className="sg-icon" aria-label="切换主题" data-glass-control onClick={()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="7"/></svg></button>
   <button type="button" ref={trigger} className="sg-icon sg-menu-button" aria-label="导航菜单" aria-expanded={open} aria-controls="fixture-nav" data-glass-control onClick={()=>setOpen(!open)}><svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div>
  </div></header>
  <main className="sg-content" style={{paddingTop:120,minHeight:1600}}><h1>{selected}</h1>
   <GlassTabs label="分类" selection={tab}>{['all','tools','reading'].map(id=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{id}</button>)}</GlassTabs>
   <article className="sg-card sg-surface" data-glass-surface style={{marginTop:30}}><div className="sg-card-content"><h2>长标题和清楚的阅读层级</h2><p className="sg-description">中文内容保持清晰，背景有柔和折射。</p><GlassButton variant="primary">普通操作</GlassButton><GlassButton variant="bare" aria-label="裸图标">↗</GlassButton></div></article>
   <button type="button" className="sg-button" style={{marginTop:40}}>外部操作</button>
  </main>
 </div>;
}
const root = createRoot(document.getElementById('root'));root.render(<Fixture/>);
window.addEventListener('fixture-destroy',()=>root.unmount(),{once:true});
`;
await writeFile(`${output}/fixture.tsx`, fixture);
await build({
  entryPoints: [`${output}/fixture.tsx`],
  bundle: true,
  format: "esm",
  outfile: `${output}/fixture.js`,
  jsx: "automatic",
  loader: { ".woff2": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"' },
});
const html =
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0}</style></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
};
const skillRoot = resolve("skills/silver-liquid-glass-ui");
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/fixture.html") {
      response.setHeader("Content-Type", types[".html"]);
      response.end(html);
      return;
    }
    const file =
      path === "/fixture.js" || path === "/fixture.css"
        ? resolve(output, path.slice(1))
        : resolve(skillRoot, `.${path}`);
    if (
      !file.startsWith(skillRoot + "\\") &&
      ![resolve(output, "fixture.js"), resolve(output, "fixture.css")].includes(
        file,
      )
    )
      throw new Error("Path outside fixture");
    response.setHeader(
      "Content-Type",
      types[extname(file)] || "application/octet-stream",
    );
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = [];
try {
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"])
      for (const motion of ["no-preference", "reduce"]) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          reducedMotion: motion,
        });
        await context.addInitScript((theme) => {
          const apply = () => (document.documentElement.dataset.theme = theme);
          if (document.documentElement) apply();
          document.addEventListener("DOMContentLoaded", apply, { once: true });
        }, theme);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/fixture.html#one`);
        await expect(
          page.getByRole("heading", { name: "one", exact: true }),
        ).toBeVisible();
        const nav = page.locator("nav");
        const mobile = width <= 820;
        await nav.evaluate((element) => (element.dataset.persist = "original"));
        if (mobile) {
          await expect(nav).toHaveAttribute("inert", "");
          await page.getByRole("button", { name: "导航菜单" }).click();
          await expect(nav).toHaveAttribute("data-open", "true");
          await expect(nav).not.toHaveAttribute("inert");
        }
        const before = await page.locator("header").boundingBox();
        await page.getByRole("link", { name: "趋势观察", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "two", exact: true }),
        ).toBeVisible();
        await page.getByRole("link", { name: "我的收藏", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "four", exact: true }),
        ).toBeVisible();
        if (mobile) await expect(nav).toHaveAttribute("data-open", "true");
        await expect(nav).toHaveAttribute("data-persist", "original");
        expect((await page.locator("header").boundingBox()).x).toBe(before.x);
        await expect
          .poll(() =>
            nav.evaluate((element) => {
              const target = element
                .querySelector('[aria-current="page"]')
                .getBoundingClientRect();
              const droplet = element
                .querySelector(".sg-droplet")
                .getBoundingClientRect();
              return Math.max(
                Math.abs(target.x - droplet.x),
                Math.abs(target.width - droplet.width),
              );
            }),
          )
          .toBeLessThan(1);
        if (motion === "reduce")
          expect(
            await nav
              .locator(".sg-droplet")
              .evaluate((element) => element.getAnimations().length),
          ).toBe(0);
        await page.goBack();
        await expect(
          page.getByRole("heading", { name: "two", exact: true }),
        ).toBeVisible();
        if (mobile) {
          await expect(nav).toHaveAttribute("data-open", "true");
          await page.evaluate(() => scrollTo(0, 250));
          await expect(nav).toHaveAttribute("data-open", "true");
          await page.keyboard.press("Escape");
          await expect(nav).toHaveAttribute("inert", "");
          await expect(
            page.getByRole("button", { name: "导航菜单" }),
          ).toBeFocused();
          await page.getByRole("button", { name: "导航菜单" }).click();
          await page.getByRole("button", { name: "外部操作" }).click();
          await expect(nav).toHaveAttribute("data-open", "false");
          await page.getByRole("button", { name: "导航菜单" }).click();
          await page.locator("main").dispatchEvent("touchmove");
          await expect(nav).toHaveAttribute("data-open", "false");
          const centers = await page
            .getByRole("button", { name: "导航菜单" })
            .evaluate((element) => {
              const a = element.getBoundingClientRect(),
                b = element.querySelector("svg").getBoundingClientRect();
              return {
                width: a.width,
                height: a.height,
                dx: Math.abs(a.x + a.width / 2 - b.x - b.width / 2),
                dy: Math.abs(a.y + a.height / 2 - b.y - b.height / 2),
              };
            });
          expect(centers.width).toBe(44);
          expect(centers.height).toBe(44);
          expect(centers.dx).toBeLessThan(0.1);
          expect(centers.dy).toBeLessThan(0.1);
        }
        await page
          .getByRole("button", { name: "reading", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "reading", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        const bare = await page
          .getByRole("button", { name: "裸图标" })
          .evaluate((element) => ({
            glass: element.hasAttribute("data-lg-refraction"),
            background: getComputedStyle(element).backgroundColor,
          }));
        expect(bare.glass).toBe(false);
        expect(bare.background).toBe("rgba(0, 0, 0, 0)");
        await expect
          .poll(() => page.locator("[data-lg-refraction]").count())
          .toBeGreaterThan(0);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: `${output}/react-${width}-${theme}-${motion}.png`,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-reduced-transparency", value: "reduce" },
            { name: "prefers-reduced-motion", value: motion },
          ],
        });
        await expect
          .poll(
            () =>
              page.evaluate(() => ({
                reduced: matchMedia("(prefers-reduced-transparency: reduce)")
                  .matches,
                assigned: document.querySelectorAll("[data-lg-refraction]")
                  .length,
              })),
            {
              message: `${width}/${theme}/${motion}: live transparency preference clears optics`,
            },
          )
          .toEqual({ reduced: true, assigned: 0 });
        expect(
          await page
            .locator(".sg-card")
            .evaluate((element) => getComputedStyle(element).backdropFilter),
        ).toBe("none");
        await page.evaluate(() => dispatchEvent(new Event("fixture-destroy")));
        await expect(page.locator("svg[data-liquid-glass-html]")).toHaveCount(
          0,
        );
        expect(errors).toEqual([]);
        report.push({
          kind: "react-starter",
          width,
          theme,
          motion,
          passed: true,
        });
        await context.close();
      }
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/assets/starter/demo.html`);
      await page.evaluate(() => document.fonts.ready);
      if (theme === "dark")
        await page.getByRole("button", { name: "切换主题" }).click();
      if (width <= 820)
        await page.getByRole("button", { name: "打开导航" }).click();
      await page.getByRole("link", { name: "动手体验", exact: true }).click();
      await expect(page.locator("#section-title")).toHaveText("动手体验");
      if (width <= 820)
        await expect(page.locator("nav")).toHaveAttribute("data-open", "true");
      await page.getByRole("button", { name: "工具", exact: true }).click();
      await expect(page.locator("#cards > article:visible")).toHaveCount(1);
      await page
        .getByRole("button", { name: "收藏", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("button", { name: "已收藏", exact: true }),
      ).toBeVisible();
      await page.evaluate(() => scrollTo(0, 0));
      if (width <= 820)
        await page.getByRole("button", { name: "打开导航" }).click();
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      await page.screenshot({ path: `${output}/demo-${width}-${theme}.png` });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      report.push({ kind: "static-demo", width, theme, passed: true });
      await context.close();
    }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(
  `${report.length} starter/demo viewport-theme-motion checks passed. Optical fallback, cleanup, navigation persistence and gestures verified.`,
);
