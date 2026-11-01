# Liquid-Glass-HTML 接入

日期：2026-11-01。用户指定：[Weiqin-Mo/Liquid-Glass-HTML](https://github.com/Weiqin-Mo/Liquid-Glass-HTML)。

## 源码与接入

固定上游提交 `c6810701752f20098137cd719300dc8b6aa02d3f`，MIT License，Copyright (c) 2026 NightS.。`src/vendor/liquid-glass-html/displacement.js` 从主 HTML 提取原始 `smoothStep`、`roundedRectSDF` 和 `buildDisplacementMap`；除导出与格式外数学计算保持。许可证、Wood Chen 鸣谢保留；构建中分发 `licenses/liquid-glass-html-MIT.txt`。

实际管线为圆角矩形 SDF → Canvas 位移贴图 → SVG `feImage` / `feDisplacementMap` → `backdrop-filter`。作用于背景，文字与图片自身不做变形。搜索框、导航、可见项目卡、动态面板、榜单、弹窗和按钮自动接入；内容标题/图片链接不另套玻璃，Excalidraw 内部控件排除。

新增 `src/liquidGlassController.ts` 和 `src/useLiquidRefraction.ts` 适配 React，`src/liquid-refraction.css` 使用上游玻璃阴影、透色与按压曲线，按站点主题调整。未导入上游演示页面的滑块、开关、全局脚本或业务状态。

## 性能与回退

- IntersectionObserver 仅调度视口内表面，离开视口释放绑定；ResizeObserver 根据实际尺寸重建。
- 位移图最长 512px、最多 131,072 像素，SVG 将贴图与位移尺度还原到实际尺寸。任务分帧让出执行，尺寸相同的滤镜复用。
- 缓存按 64 条 / 4 MB 字符存储预算清理无人使用的条目；仍被可见表面引用的滤镜不强行移除，因此这不是包含活动引用的硬上限。
- 保留上游视口采样钳制思路，滚动/缩放结束 160ms 后更新边界；没有持续动画循环。
- React StrictMode、路由/弹窗移除、整个控制器卸载时清理样式、观察器和 SVG。忽略真实编辑器内部的 DOM 更新。
- Chrome/Edge 使用 SVG 折射；对其他引擎保留基础磨砂，不承诺 Safari/Firefox 的 URL backdrop-filter 支持。减少透明度关闭折射、清理贴图并使用实色；减少动画保留静态光学效果，关闭动态高光和按压放大。

## 验证

- `npm run build` 通过，保留既有 Excalidraw 大包提示。
- `npm test -- --reporter=line`：42 项通过。新增回归验证真实 SVG/PNG 贴图、手机尺寸更新、关闭弹窗后解绑、StrictMode 单一 SVG 容器，以及减少透明度开关的释放/恢复。
- `node scripts/verify-liquid-glass-html.mjs`：39 项通过。包括深浅主题、360/390/768/1024/1440px、菜单、卡片、阅读弹窗和榜单，无页面错误、横向溢出或卡片重叠。
- 在临时网格背景上拍摄折射开/关截图，并通过 Pillow 比较像素：边缘存在实际位移，中央区保持不变。该网格只存在于验证浏览器，没有加入产品页面。
- 截图和原始数值位于 `docs/screenshots/liquid-glass-html/`；已查看桌面、手机、深色、卡片与快速阅读截图。

业务代码仅增加材质 hook 的挂载；GitHub 限流、搜索、推荐、问答、收藏、分页和白板逻辑未修改。
