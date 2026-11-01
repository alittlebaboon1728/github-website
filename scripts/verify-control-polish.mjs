import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { catalog } from "../tests/fixtures/trials.mjs";

const output = "docs/screenshots/control-polish";
await mkdir(output, { recursive: true });
const { repositories } = JSON.parse(
  await readFile(
    new URL("../src/repository-snapshot.json", import.meta.url),
    "utf8",
  ),
);
const samples = ["excalidraw/excalidraw", "public-apis/public-apis"].map(
  (name) => repositories.find((repo) => repo.fullName === name),
);
const at = "2026-11-01T09:30:00Z";
const envelope = (data) => ({ data, source: "cache", fetchedAt: at });
const raw = (repo) => ({
  id: Number(repo.id),
  name: repo.name,
  full_name: repo.fullName,
  owner: { login: repo.owner, avatar_url: repo.avatar },
  html_url: repo.url,
  description: repo.description,
  stargazers_count: repo.stars,
  forks_count: repo.forks,
  language: repo.language,
  topics: repo.tags,
  pushed_at: repo.updated,
  default_branch: repo.defaultBranch,
  license: { spdx_id: repo.license },
});
const checks = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const dark of [false, true])
    for (const width of [390, 1440]) {
      const theme = dark ? "dark" : "light";
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        (dark) => localStorage.setItem("gh-design-dark", JSON.stringify(dark)),
        dark,
      );
      const page = await context.newPage();
      const errors = [];
      let posts = 0;
      page.on("pageerror", (error) => errors.push(error.message));
      // All API calls are local fixtures: visual verification cannot invoke a model.
      await page.route("**/api/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() === "POST") posts++;
        if (path.endsWith("/trends"))
          return route.fulfill({
            json: envelope({
              repositories: [],
              query: "fixture",
              scope: "界面检查样本",
              persistence: true,
              growth: { ready: false, items: [], coverage: "界面检查样本" },
            }),
          });
        if (path.startsWith("/api/github/repos/"))
          return route.fulfill({
            json: envelope(
              path.endsWith("/readme")
                ? {
                    content: "# README 原文\n\n用于检查阅读与切换的文档样本。",
                    path: "README.md",
                    html_url: samples[0].url + "#readme",
                  }
                : raw(samples[0]),
            ),
          });
        const data = path.endsWith("/search")
          ? {
              items: samples.map(raw),
              total_count: 2,
              incomplete_results: false,
            }
          : path.endsWith("/trials")
            ? catalog
            : path.endsWith("/project-media")
              ? { image: null }
              : path.endsWith("/status")
                ? { cardGeneration: false, aiConfigured: false }
                : path.endsWith("/pulse")
                  ? {
                      events: Array.from({ length: 8 }, (_, index) => ({
                        id: `event-${index}`,
                        type: "pull_request",
                        repo: samples[index % 2].fullName,
                        text: `更新 PR #${120 + index}`,
                        url: `${samples[index % 2].url}/pull/${120 + index}`,
                        occurredAt: at,
                      })),
                      bars: Array.from({ length: 12 }, (_, index) => ({
                        at: new Date(
                          Date.parse(at) + index * 5000,
                        ).toISOString(),
                        count: 200 + ((index * 37) % 230),
                      })),
                      fetchedAt: at,
                      scope: "界面检查样本",
                      provider: "界面检查样本",
                    }
                  : null;
        return route.fulfill(
          data
            ? { json: envelope(data) }
            : { status: 503, json: { error: "界面检查不调用模型" } },
        );
      });
      await page.goto("http://127.0.0.1:5173/");
      await expect(page.locator(".project-card")).toHaveCount(2);
      await page.evaluate(() => document.fonts.ready);
      const clearControls = async () => {
        const styles = await page
          .locator(
            ".project-search-icon, .gh-pulse-controls button, .summary-language-toggle",
          )
          .evaluateAll((elements) =>
            elements.map((element) => {
              const style = getComputedStyle(element);
              return {
                background: style.backgroundColor,
                image: style.backgroundImage,
                shadow: style.boxShadow,
                filter: style.backdropFilter,
                refracted: element.hasAttribute("data-lg-refraction"),
                width: element.getBoundingClientRect().width,
                height: element.getBoundingClientRect().height,
              };
            }),
          );
        expect(styles.length).toBeGreaterThanOrEqual(5);
        for (const style of styles) {
          expect(style.background).toBe("rgba(0, 0, 0, 0)");
          expect(style.image).toBe("none");
          expect(style.shadow).toBe("none");
          expect(style.filter).toBe("none");
          expect(style.refracted).toBe(false);
          expect(style.width).toBeGreaterThanOrEqual(44);
          expect(style.height).toBeGreaterThanOrEqual(44);
        }
        return styles.length;
      };
      const iconCount = await clearControls();
      await page.screenshot({ path: `${output}/home-${theme}-${width}.png` });
      await page
        .locator(".gh-pulse")
        .screenshot({ path: `${output}/pulse-${theme}-${width}.png` });
      await page.getByRole("button", { name: "搜索设置", exact: true }).click();
      await clearControls();
      await page.keyboard.press("Escape");
      const toggle = page
        .getByRole("button", { name: "显示原文", exact: true })
        .first();
      await toggle.click();
      await clearControls();
      await page
        .getByRole("button", { name: "显示中文", exact: true })
        .first()
        .click();
      const group = page.getByRole("group", { name: "按用途浏览" });
      await group.scrollIntoViewIfNeeded();
      await page
        .locator(".discovery-filter-row")
        .screenshot({ path: `${output}/filters-${theme}-${width}.png` });
      const language = page.getByLabel("按编程语言筛选");
      await language.click();
      expect(
        await language.evaluate((element) => element.matches(":open")),
      ).toBe(true);
      await page.screenshot({
        path: `${output}/language-${theme}-${width}.png`,
      });
      await page
        .getByRole("option", { name: "TypeScript", exact: true })
        .click();
      await expect(language).toHaveValue("TypeScript");
      const sort = page.getByLabel("项目排序", { exact: true });
      await sort.click();
      await page.screenshot({ path: `${output}/sort-${theme}-${width}.png` });
      await page.keyboard.press("Escape");
      await expect(sort).toBeFocused();

      // Exercise variable-width and wrapped rows, including a second click mid-flight.
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const droplet = group.locator(".selection-droplet");
      await group
        .getByRole("button", { name: "AI 与智能", exact: true })
        .click();
      const middle = await droplet.evaluate((element) => {
        const animation = element.getAnimations()[0];
        animation.pause();
        animation.currentTime =
          Number(animation.effect.getTiming().duration) * 0.42;
        const bounds = element.getBoundingClientRect();
        return {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
      });
      await group
        .getByRole("button", { name: "设计与创意", exact: true })
        .evaluate((element) => element.click());
      const resumed = await droplet.evaluate((element) => {
        const animation = element.getAnimations()[0];
        animation.pause();
        animation.currentTime = 0;
        const bounds = element.getBoundingClientRect();
        animation.finish();
        return {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
      });
      for (const key of ["x", "y", "width", "height"])
        expect(Math.abs(middle[key] - resumed[key])).toBeLessThan(1);
      const selected = await group
        .getByRole("button", { name: "设计与创意", exact: true })
        .boundingBox();
      const settled = await droplet.boundingBox();
      for (const key of ["x", "y", "width", "height"])
        expect(Math.abs(selected[key] - settled[key])).toBeLessThan(1);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const next = group.getByRole("button", {
        name: "数据与后端",
        exact: true,
      });
      await next.focus();
      await page.keyboard.press("Enter");
      await expect(next).toHaveAttribute("aria-pressed", "true");
      expect(
        await droplet.evaluate((element) => element.getAnimations().length),
      ).toBe(0);

      // Both native pickers and the settings menu must animate in both directions.
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await language.click();
      await page.waitForTimeout(240);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(65);
      const pickerClosing = await language.evaluate((element) => {
        const css = getComputedStyle(element, "::picker(select)");
        return {
          display: css.display,
          opacity: Number(css.opacity),
          open: element.matches(":open"),
        };
      });
      expect(pickerClosing.open).toBe(false);
      expect(pickerClosing.display).toBe("block");
      expect(pickerClosing.opacity).toBeGreaterThan(0);
      expect(pickerClosing.opacity).toBeLessThan(1);
      await page.screenshot({
        path: `${output}/picker-closing-${theme}-${width}.png`,
      });
      await expect
        .poll(() =>
          language.evaluate(
            (element) => getComputedStyle(element, "::picker(select)").display,
          ),
        )
        .toBe("none");
      const gear = page.getByRole("button", { name: "搜索设置", exact: true });
      await gear.click();
      await expect(page.getByRole("menu", { name: "搜索模式" })).toBeVisible();
      await page.waitForTimeout(240);
      await page.keyboard.press("Escape");
      const menu = page.locator(".project-search-menu");
      await page.waitForTimeout(65);
      const menuClosing = await menu.evaluate((element) => ({
        hidden: element.hidden,
        inert: element.inert,
        display: getComputedStyle(element).display,
        opacity: Number(getComputedStyle(element).opacity),
      }));
      expect(menuClosing.hidden).toBe(true);
      expect(menuClosing.inert).toBe(true);
      expect(menuClosing.display).toBe("block");
      expect(menuClosing.opacity).toBeGreaterThan(0);
      expect(menuClosing.opacity).toBeLessThan(1);
      // Reopening during exit must not leave the menu hidden or steal keyboard focus.
      await gear.click();
      await expect(
        page.getByRole("menuitemradio", { name: "自动识别", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(gear).toBeFocused();
      await expect(menu).toBeHidden();

      await page
        .getByRole("button", {
          name: `快速了解 ${samples[1].fullName}`,
          exact: true,
        })
        .click();
      const pager = page.getByRole("group", { name: "切换项目" });
      await expect(pager.getByRole("button")).toHaveCount(2);
      expect(
        await pager.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).borderRadius),
        ),
      ).toBeGreaterThan(40);
      const pagingStyles = await pager
        .getByRole("button")
        .evaluateAll((buttons) =>
          buttons.map((button) => ({
            background: getComputedStyle(button).backgroundColor,
            shadow: getComputedStyle(button).boxShadow,
            refracted: button.hasAttribute("data-lg-refraction"),
          })),
        );
      for (const style of pagingStyles) {
        expect(style.background).toBe("rgba(0, 0, 0, 0)");
        expect(style.shadow).toBe("none");
        expect(style.refracted).toBe(false);
      }
      await page
        .getByRole("dialog")
        .screenshot({ path: `${output}/quick-read-${theme}-${width}.png` });
      await pager
        .getByRole("button", { name: "上一个项目", exact: true })
        .click();
      await expect(
        pager.getByRole("button", { name: "上一个项目", exact: true }),
      ).toBeDisabled();
      await expect(
        pager.getByRole("button", { name: "下一个项目", exact: true }),
      ).toBeEnabled();
      await page.keyboard.press("Escape");

      for (const [name, path, label, first, second, last] of [
        ["rankings", "/#/trends", "数据视图", "排行榜", "热门趋势", "排行榜"],
        [
          "reader",
          "/#/project/excalidraw/excalidraw",
          "项目内容",
          "中文使用说明",
          "README 原文",
          "仓库资料",
        ],
      ]) {
        await page.goto(`http://127.0.0.1:5173${path}`);
        const tabs = page.getByLabel(label, { exact: true });
        await expect(tabs).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const indicator = tabs.locator(".selection-droplet");
        const original = await indicator.elementHandle();
        await tabs.getByRole("button", { name: second, exact: true }).click();
        await expect
          .poll(() =>
            indicator.evaluate((element) => element.getAnimations().length),
          )
          .toBeGreaterThan(0);
        const during = await indicator.evaluate((element) => {
          const animation = element.getAnimations()[0];
          animation.pause();
          animation.currentTime =
            Number(animation.effect.getTiming().duration) * 0.42;
          return element.getBoundingClientRect().toJSON();
        });
        await page.screenshot({
          path: `${output}/${name}-moving-${theme}-${width}.png`,
        });
        await tabs
          .getByRole("button", { name: last, exact: true })
          .evaluate((element) => element.click());
        expect(
          await indicator.evaluate(
            (element, original) => element === original,
            original,
          ),
        ).toBe(true);
        const continued = await indicator.evaluate((element) => {
          const animation = element.getAnimations()[0];
          animation.pause();
          animation.currentTime = 0;
          const bounds = element.getBoundingClientRect().toJSON();
          animation.finish();
          return bounds;
        });
        for (const key of ["x", "y", "width", "height"])
          expect(Math.abs(during[key] - continued[key])).toBeLessThan(1);
        await page.screenshot({
          path: `${output}/${name}-tabs-${theme}-${width}.png`,
        });
        const buttons = await tabs
          .getByRole("button")
          .evaluateAll((buttons) =>
            buttons.map((button) => ({
              background: getComputedStyle(button).backgroundColor,
              shadow: getComputedStyle(button).boxShadow,
              refracted: button.hasAttribute("data-lg-refraction"),
            })),
          );
        for (const style of buttons) {
          expect(style.background).toBe("rgba(0, 0, 0, 0)");
          expect(style.shadow).toBe("none");
          expect(style.refracted).toBe(false);
        }
        await page.emulateMedia({ reducedMotion: "reduce" });
        const target = tabs.getByRole("button", {
          name: name === "reader" ? first : second,
          exact: true,
        });
        await target.focus();
        await page.keyboard.press("Enter");
        await expect(target).toHaveAttribute("aria-pressed", "true");
        expect(
          await indicator.evaluate((element) => element.getAnimations().length),
        ).toBe(0);
        await page.emulateMedia({ reducedMotion: "no-preference" });
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      expect(overflow).toBe(false);
      expect(errors).toEqual([]);
      expect(posts).toBe(0);
      checks.push({
        theme,
        width,
        iconCount,
        overflow,
        errors,
        posts,
        pickerClosing,
        menuClosing,
        passed: true,
      });
      await context.close();
    }
} finally {
  await browser.close();
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify(checks, null, 2) + "\n",
  );
}
console.log(JSON.stringify(checks, null, 2));
