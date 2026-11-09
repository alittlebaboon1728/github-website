/*
 * Liquid-Glass-HTML — Copyright (c) 2026 NightS. MIT License (see LICENSE).
 * https://github.com/Weiqin-Mo/Liquid-Glass-HTML
 * Source commit: c6810701752f20098137cd719300dc8b6aa02d3f
 * Extracted from "Liquid-Glass index.html". The SDF, flow, and encoding math is unchanged.
 * Shader inspiration: Wood Chen, https://www.sunai.net/t/topic/1381
 */
function smoothStep(a, b, t) {
  const v = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return v * v * (3 - 2 * v);
}

function roundedRectSDF(x, y, halfW, halfH, r) {
  const qx = Math.abs(x) - halfW + r;
  const qy = Math.abs(y) - halfH + r;
  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
    r
  );
}

export function buildDisplacementMap(
  width,
  height,
  radius,
  strength,
  distortion,
  clamp,
) {
  // clamp: { left, top, viewportWidth, viewportHeight } 元素相对视口的屏幕位置，
  // 用于把折射取样点钳制在网页范围内；null 表示无需限制
  const longSide = Math.max(width, height);
  const halfW = width / longSide / 2;
  const halfH = height / longSide / 2;
  const r = Math.min(radius / longSide, Math.min(halfW, halfH) - 0.001);
  const refractionBand = 0.12;
  // 自适应 Band 裁切：边缘过渡带不超过该轴最小半长的一半，
  // 避免细长元素（如音量条）上过渡带超出自身一半
  const effectiveBand = Math.min(refractionBand, Math.min(halfW, halfH) / 2);
  const refractionStrength = strength * 0.05;

  const distortionScale = distortion * 0.35;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { url: "", scale: 0 };

  const image = ctx.createImageData(canvas.width, canvas.height);
  const data = image.data;

  let maxScale = 0;
  const buf = new Float32Array(canvas.width * canvas.height * 2);
  let bi = 0;

  for (let y = 0; y < canvas.height; y++) {
    const v = (y / canvas.height - 0.5) * (height / longSide);
    for (let x = 0; x < canvas.width; x++) {
      const u = (x / canvas.width - 0.5) * (width / longSide);
      const dist = roundedRectSDF(u, v, halfW, halfH, r);
      const t = smoothStep(-effectiveBand, 0, dist);
      const len = Math.hypot(u, v) || 1;
      const baseMag = t * refractionStrength * longSide;
      // 方向反转：折射取样方向取径向反方向
      let dx = -(u / len) * baseMag;
      let dy = -(v / len) * baseMag;

      if (t > 0 && distortionScale > 0) {
        const angle = Math.atan2(v, u);
        const radius = Math.hypot(u, v);
        const swirl = Math.sin(radius * 10 - angle * 4) * distortionScale * t;
        const flowX =
          Math.sin(x * 0.05 + y * 0.03) + Math.cos(x * 0.02 - y * 0.04) * 0.7;
        const flowY =
          Math.sin(y * 0.04 + x * 0.025) +
          Math.cos(y * 0.055 - x * 0.018) * 0.7;

        const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
        dx += tangent.x * swirl + flowX * distortionScale * t;
        dy += tangent.y * swirl + flowY * distortionScale * t;
      }

      // 限制折射取样范围：把位移后的取样点钳制在网页（可见视口）范围内，
      // 贴边元素（顶栏/浮动面板）不会把视口外的浏览器 UI 折射进来
      if (clamp) {
        const sx = clamp.left + x + dx;
        const sy = clamp.top + y + dy;
        dx =
          Math.min(
            Math.max(sx, clamp.viewportLeft),
            clamp.viewportLeft + clamp.viewportWidth,
          ) -
          (clamp.left + x);
        dy =
          Math.min(
            Math.max(sy, clamp.viewportTop),
            clamp.viewportTop + clamp.viewportHeight,
          ) -
          (clamp.top + y);
      }

      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
      buf[bi++] = dx;
      buf[bi++] = dy;
    }
  }

  if (maxScale === 0) maxScale = 1;

  let i = 0;
  for (let p = 0; p < data.length; p += 4) {
    const r = buf[i++] / maxScale / 2 + 0.5;
    const g = buf[i++] / maxScale / 2 + 0.5;
    data[p] = r * 255;
    data[p + 1] = g * 255;
    data[p + 2] = 0;
    data[p + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return { url: canvas.toDataURL(), scale: maxScale * 2 };
}
