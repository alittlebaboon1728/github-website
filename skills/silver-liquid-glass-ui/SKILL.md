---
name: silver-liquid-glass-ui
description: 复现开源观测站的银灰液态玻璃前端风格，包括深浅主题、编辑式中文标题、卡片瀑布流、连续水滴导航和保持展开状态的手机菜单。用于明确要求沿用此站风格、银灰薄玻璃或调用此技能的新页面和界面改造。
---

# 银灰液态玻璃 UI

将本技能的材质、排版和交互迁移到目标产品。基准是 2026-11-09 开源观测站实际运行界面；技能已经包含截图、最终计算样式、原始代码和独立起步代码，无需访问原项目或其后台。

先读取 [设计系统](references/design-system.md)，并查看 `assets/visual-reference/home-light-1440.png`、`home-dark-1440.png`、`navigation-dark-390.png`。只制作单个组件时，再读 [组件规格](references/components.md) 中对应部分；涉及水滴、菜单、光学和预加载时读 [动画与性能](references/motion-and-performance.md)。迁移代码及来源查 [实现与来源](references/implementation.md)。

保留这些识别特征：

- 银灰／石墨的固定柔和渐变底；文字与点缀保留低饱和绿，局部试用封面可以有柔紫等清楚的主题色。
- 玻璃主要透色和轻微模糊，顶部内高光仅 0.5px；文字和插图始终清晰。原始 Liquid-Glass-HTML SDF 只折射背景。
- 中文主标题配编辑式字形，英文副题用 Instrument Serif 斜体；内容以安静留白、自然高度卡片和紧凑资料层级组织。
- 选择态由一个持续存在的水滴承载。快速连点从当前动画位置接续；切页面保持同一个导航 DOM。
- 手机主题／菜单按钮是 44×44 的可见玻璃按钮；搜索发送、搜索设置、实时动态控制等保留轻量裸图标。
- 手机菜单切页面后继续展开以展示水滴移动；外部点击、触摸滑动或滚轮才收起，Escape 收起并归还焦点。路由恢复滚动不触发收起。

按目标产品已有架构实现。导航项数量、业务文案、数据源、对话存储策略和页面结构可以随产品调整；四个栏目、GitHub 标志、项目名与试用生成接口属于参考站内容，不是风格要求。用户明确要求的修改优先于基准尺寸。

`assets/starter/silver-glass.css`、`GlassPrimitives.tsx`、`useDropletIndicator.ts`、`useGlassEffects.ts` 和 `usePersistentMenu.ts` 可复制到 React/TypeScript 项目。`demo.html` 是无需构建的材质与导航样例；用普通静态 HTTP 服务打开。`LiquidGlassController.js`、其声明文件和整个 `vendor/liquid-glass-html/` 一起复制，保留 MIT 许可。非 React 项目按相同 CSS 与交互机制移植。

`assets/original/` 是完整的样式及关键视觉组件快照，用于查精确细节；不要将所有历史 CSS 不加选择地覆盖到新项目。先用起步样式，再按组件补齐。自定义中文字体未随包分发；使用目标项目有权使用的字形，精确复现时由用户提供原字体。

验证与交付按改动范围进行：至少实际查看桌面和手机、深浅两主题；涉及导航时检查连续点击、后退、菜单保留与外部收起、键盘和减少动画。确认无横向溢出，按钮图标居中，切换能先显示已缓存内容。记录验证结果及字体或浏览器回退的真实差异。无需因使用本技能额外联网、生成内容、部署或发送消息。
