// Selector adaptation of the original viewport adapter. Optical renderer: MIT © 2026 NightS.
import { buildDisplacementMap } from "./vendor/liquid-glass-html/displacement.js";
const SVG_NS = "http://www.w3.org/2000/svg";
const SURFACES = "[data-glass-surface]";
const CONTROLS = "[data-glass-control]";
const EXCLUDED = "[data-glass-bare], [data-glass-exclude], [data-glass-exclude] *";
const SELECTOR = `${SURFACES}, ${CONTROLS}`;
let instance = 0;
class LiquidGlassController {
  constructor(root) {
    this.root = root;
    this.svg.setAttribute("width", "0");
    this.svg.setAttribute("height", "0");
    this.svg.setAttribute("aria-hidden", "true");
    this.svg.setAttribute("focusable", "false");
    this.svg.setAttribute("data-liquid-glass-html", "");
    this.svg.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;overflow:hidden";
    this.svg.append(this.defs);
    document.body.append(this.svg);
    this.intersection = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        const element = target;
        if (isIntersecting) {
          this.visible.add(element);
          this.enqueue(element);
        } else {
          this.visible.delete(element);
          this.pending.delete(element);
          this.release(element);
        }
      }
      this.prune();
    });
    this.resize = new ResizeObserver((entries) => {
      for (const { target } of entries) this.enqueue(target);
    });
    this.mutation = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement) this.discover(node);
      }
      for (const element of this.tracked) {
        if (this.root.contains(element)) continue;
        this.intersection.unobserve(element);
        this.resize.unobserve(element);
        this.tracked.delete(element);
        this.visible.delete(element);
        this.pending.delete(element);
        this.release(element);
      }
      this.prune();
    });
    this.discover(root);
    this.mutation.observe(root, { childList: true, subtree: true });
    this.transparency.addEventListener("change", this.preferences);
    document.addEventListener("visibilitychange", this.preferences);
    window.addEventListener("scroll", this.scroll, {
      passive: true,
      capture: true
    });
    window.addEventListener("resize", this.scroll, { passive: true });
    window.visualViewport?.addEventListener("resize", this.scroll, {
      passive: true
    });
    window.visualViewport?.addEventListener("scroll", this.scroll, {
      passive: true
    });
  }
  tracked = /* @__PURE__ */ new Set();
  visible = /* @__PURE__ */ new Set();
  pending = /* @__PURE__ */ new Set();
  assigned = /* @__PURE__ */ new Map();
  cache = /* @__PURE__ */ new Map();
  transparency = matchMedia(
    "(prefers-reduced-transparency: reduce)"
  );
  svg = document.createElementNS(SVG_NS, "svg");
  defs = document.createElementNS(SVG_NS, "defs");
  prefix = `lgh-${++instance}`;
  intersection;
  resize;
  mutation;
  serial = 0;
  timer = 0;
  scrollTimer = 0;
  destroyed = false;
  static supported() {
    return /(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent) && CSS.supports("backdrop-filter", 'blur(1px) url("#lgh-probe")');
  }
  discover(node) {
    if (node.closest("[data-glass-exclude]")) return;
    const elements = [...node.querySelectorAll(SELECTOR)];
    if (node.matches(SELECTOR)) elements.unshift(node);
    for (const element of elements) {
      if (this.tracked.has(element) || element.matches(EXCLUDED)) continue;
      this.tracked.add(element);
      this.intersection.observe(element);
      this.resize.observe(element);
    }
  }
  enqueue(element) {
    if (this.destroyed || this.transparency.matches || document.hidden || !this.visible.has(element))
      return;
    this.pending.add(element);
    if (!this.timer) this.timer = window.setTimeout(this.flush, 16);
  }
  flush = () => {
    this.timer = 0;
    if (this.destroyed || this.transparency.matches || document.hidden) return;
    const start = performance.now();
    for (const element of this.pending) {
      this.pending.delete(element);
      if (element.isConnected && this.visible.has(element)) {
        try {
          this.apply(element);
        } catch {
          this.release(element);
        }
      }
      if (performance.now() - start >= 7) break;
    }
    this.prune();
    if (this.pending.size) this.timer = window.setTimeout(this.flush, 16);
  };
  apply(element) {
    const width = element.offsetWidth, height = element.offsetHeight;
    if (width < 8 || height < 8 || width > 5e3 || height > 5e3) {
      this.release(element);
      return;
    }
    const rect = element.getBoundingClientRect();
    const radius = Math.min(
      parseFloat(getComputedStyle(element).borderTopLeftRadius) || 16,
      width / 2,
      height / 2
    );
    const control = element.matches(CONTROLS);
    const strength = control ? 0.9 : element.matches("[data-glass-strong]") ? 1.2 : 0.75;
    const distortion = 0.6;
    const view = window.visualViewport;
    const viewportLeft = view?.offsetLeft || 0, viewportTop = view?.offsetTop || 0;
    const viewportWidth = view?.width || innerWidth, viewportHeight = view?.height || innerHeight;
    const margin = 4 + strength * 0.05 * Math.max(width, height) * 1.5 + distortion;
    let clamp = null;
    if (rect.left < viewportLeft + margin || rect.top < viewportTop + margin || rect.right > viewportLeft + viewportWidth - margin || rect.bottom > viewportTop + viewportHeight - margin) {
      clamp = {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        viewportLeft,
        viewportTop,
        viewportWidth,
        viewportHeight
      };
    }
    const key = [
      width,
      height,
      radius,
      strength,
      clamp ? Object.values(clamp).join(",") : "free"
    ].join("/");
    if (this.assigned.get(element) === key) return;
    let entry = this.cache.get(key);
    if (!entry) {
      const ratio = Math.min(
        1,
        512 / Math.max(width, height),
        Math.sqrt(131072 / (width * height))
      );
      const scaledClamp = clamp ? Object.fromEntries(
        Object.entries(clamp).map(([k, v]) => [k, v * ratio])
      ) : null;
      const map = buildDisplacementMap(
        width * ratio,
        height * ratio,
        radius * ratio,
        strength,
        distortion,
        scaledClamp
      );
      if (!map.url) {
        this.release(element);
        return;
      }
      const id = `${this.prefix}-${++this.serial}`;
      const filter = document.createElementNS(SVG_NS, "filter");
      for (const [name, value] of Object.entries({
        id,
        filterUnits: "userSpaceOnUse",
        x: "0",
        y: "0",
        width: String(width),
        height: String(height),
        "color-interpolation-filters": "sRGB"
      }))
        filter.setAttribute(name, value);
      const image = document.createElementNS(SVG_NS, "feImage");
      for (const [name, value] of Object.entries({
        href: map.url,
        x: "0",
        y: "0",
        width: String(width),
        height: String(height),
        preserveAspectRatio: "none",
        result: "dispMap"
      }))
        image.setAttribute(name, value);
      const displacement = document.createElementNS(
        SVG_NS,
        "feDisplacementMap"
      );
      for (const [name, value] of Object.entries({
        in: "SourceGraphic",
        in2: "dispMap",
        xChannelSelector: "R",
        yChannelSelector: "G",
        scale: String(map.scale / ratio)
      }))
        displacement.setAttribute(name, value);
      filter.append(image, displacement);
      this.defs.append(filter);
      entry = { id, node: filter, users: 0, bytes: map.url.length * 2 };
      this.cache.set(key, entry);
    }
    this.release(element);
    entry.users++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.assigned.set(element, key);
    element.style.setProperty("--lg-refraction", `url("#${entry.id}")`);
    element.dataset.lgRefraction = control ? "control" : "surface";
  }
  release(element) {
    const key = this.assigned.get(element);
    if (key) {
      const entry = this.cache.get(key);
      if (entry) entry.users--;
    }
    this.assigned.delete(element);
    element.style.removeProperty("--lg-refraction");
    delete element.dataset.lgRefraction;
  }
  prune() {
    let bytes = [...this.cache.values()].reduce(
      (sum, item) => sum + item.bytes,
      0
    );
    for (const [key, entry] of this.cache) {
      if (this.cache.size <= 64 && bytes <= 4 * 1024 * 1024) break;
      if (entry.users) continue;
      bytes -= entry.bytes;
      entry.node.remove();
      this.cache.delete(key);
    }
  }
  preferences = () => {
    if (this.transparency.matches || document.hidden) {
      clearTimeout(this.timer);
      this.timer = 0;
      this.pending.clear();
      for (const element of this.assigned.keys()) this.release(element);
      if (this.transparency.matches) {
        this.defs.replaceChildren();
        this.cache.clear();
      }
    } else for (const element of this.visible) this.enqueue(element);
  };
  scroll = () => {
    clearTimeout(this.scrollTimer);
    this.scrollTimer = window.setTimeout(() => {
      for (const element of this.visible) this.enqueue(element);
    }, 160);
  };
  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    clearTimeout(this.scrollTimer);
    this.intersection.disconnect();
    this.resize.disconnect();
    this.mutation.disconnect();
    this.transparency.removeEventListener("change", this.preferences);
    document.removeEventListener("visibilitychange", this.preferences);
    window.removeEventListener("scroll", this.scroll, true);
    window.removeEventListener("resize", this.scroll);
    window.visualViewport?.removeEventListener("resize", this.scroll);
    window.visualViewport?.removeEventListener("scroll", this.scroll);
    for (const element of this.assigned.keys()) this.release(element);
    this.svg.remove();
    this.cache.clear();
    this.pending.clear();
    this.visible.clear();
    this.tracked.clear();
  }
}
export {
  LiquidGlassController
};
