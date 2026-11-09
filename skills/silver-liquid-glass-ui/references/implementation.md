# 迁移、资产与来源

## 起步代码

`../assets/starter/` 可整体复制：

| 文件 | 用途 |
| --- | --- |
| silver-glass.css | 平铺的前台变量、背景、薄玻璃、导航/卡片/搜索/按钮响应式 |
| GlassPrimitives.tsx | 通用按钮、单水滴选项组，不绑定原API |
| useDropletIndicator.ts | 原站完整可中断WAAPI水滴hook |
| usePersistentMenu.ts | 路由之外的开关状态、外部手势与Escape焦点 |
| useGlassEffects.ts | 根ref驱动的光学生命周期、按需鼠标微光 |
| LiquidGlassController.js + .d.ts | 改data属性选择器的框架无关光学适配器 |
| vendor/liquid-glass-html/* | 原SDF和完整许可/致谢 |
| demo.html | 无需构建的静态样例，无API/模型调用 |

页面入口导入CSS，根壳只初始化一次useGlassEffects。现有hook环境React19/TypeScript/现代API，其它版本按类型与inert支持适配。保持相对目录。JS控制器有声明，不需allowJs；非React可supported()后new LiquidGlassController(root)，销毁destroy()。

```tsx
import { useRef, useState } from "react";
import "./ui/silver-glass.css";
import { GlassButton, GlassTabs } from "./ui/GlassPrimitives";
import { useGlassEffects } from "./ui/useGlassEffects";

export function Workspace() {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState("all");
  useGlassEffects(root);
  return <div ref={root} className="sg-shell">
    <main className="sg-content">
      <GlassTabs label="分类" selection={mode}>
        {["all", "recent"].map(id => <button key={id} type="button"
          aria-pressed={mode === id} onClick={() => setMode(id)}>
          {id === "all" ? "全部" : "最近"}</button>)}
      </GlassTabs>
      <article className="sg-card sg-surface" data-glass-surface>
        <div className="sg-card-content"><h2>目标产品的内容</h2>
          <p className="sg-description">保留业务，应用同一排版与材质。</p>
          <GlassButton variant="primary">开始</GlassButton>
        </div>
      </article>
    </main>
  </div>;
}
```

html的data-theme=light/dark，或适配现有主题类。Nav放路由出口之前，与usePersistentMenu常驻；不要根壳key={pathname}。sg-navigation支持--sg-nav-count，示例四项不是强制。

起步CSS已携带本地Manrope可变字体、Instrument Serif regular/italic400（fontsource 5.3.0 Latin子集），及fonts/中的两份完整SIL OFL1.1许可，无需外部CDN或额外字体包。已有字体系统时可改用其fontsource导入，注意默认Manrope Variable与原站Manrope别名。原中文艺术TTF未复制，本次未确认其再分发许可；未提供同字体时中文标题使用系统回退，不能承诺艺术中文字形一致。

## 原始快照

`../assets/original/source-manifest.json` 列33个源e26957a文件、字节和SHA-256，含活跃前后台CSS、入口、导航/玻璃/筛选/封面/轮播与光学。快照仅将文本行尾统一为LF以保证Git克隆后哈希稳定，样式选择器与逻辑不改。查精确细节无需原工作区。

- explorer.css：font-face/reset/早期结构。
- discovery.css、iteration.css：基础和历史迭代，根色板非当前唯一依据。
- refined-theme.css：最终文字语义、比例、标题、密度和响应式。
- frosted-glass.css：共享玻璃、间距、裸图标排除、手机修复、popover。
- liquid-refraction.css：SVG背板、0.5px内光、按压、透明度回退。
- site-navigation.css：滚动槽、唯一水滴、固定轨道、手机收放。
- trend-project-card/rankings/demand-chat.css：卡/榜单/对话。
- trials/project-reader/trial-showcase.css：阅读、工作台、封面轮播。
- discovery-hero.css、GitHubPulse/pulse.css：艺术标题、活动仪表。
- admin/admin.css：后台布局和密度。

main.tsx声明顺序：fonts → App → explorer → discovery → iteration → repository-card → trend-project-card → demand-chat → refined-theme → rankings → trials → project-reader → trial-showcase → frosted-glass → liquid-refraction → site-navigation；组件还有自己的CSS导入。生产跨入口提取后，shared useLiquidRefraction CSS在main CSS前；所以前台根语义来自refined-theme，具体玻璃靠高specificity保留；后台根值为frosted-glass灰色。实际取值见computed-styles.json，不能将声明顺序当作跨chunk唯一真相。

优先：用户当前要求 → 运行截图/计算值及最终选择器 → 当前实现 → 历史说明。旧Lens WebGL、暖奶油/陶土主色、厚白双环、每项active背景、旧博客与旧打勾练习均非基准。快照历史声明供追溯，不全部恢复。

## 来源与边界

光学来自 https://github.com/Weiqin-Mo/Liquid-Glass-HTML ，固定c6810701752f20098137cd719300dc8b6aa02d3f；保留MIT ©2026 NightS.与Thanks.txt（WoodChen）。portable控制器仅改选择器并去TS类型，SDF原样复制。Manrope与Instrument Serif本地WOFF2按SIL OFL1.1连同完整许可分发；未打包原中文艺术TTF。

截图含当时公开项目名/图像与本机后台状态，仅视觉参考，不授予第三方标志或品牌权利。用目标产品文案素材。技能无密钥、API配置、缓存数据库、生成内容文件或后台令牌。

## 捕获与验证

原仓库维护工具scripts/capture-ui-style.mjs只读正式GET，拦截检查无浏览器生成POST，产34张图和计算值；prepare-ui-skill-assets.mjs复制白名单、记SHA256并生成适配器。两者不属于技能运行依赖，安装后无需原仓库或4173服务。

任意技能副本根运行 `python -m http.server 8080 --bind 127.0.0.1`，打开 `/assets/starter/demo.html`。HTTP避免file:模块限制；无需原服务、缓存或模型。demo展示材质/手机菜单/单水滴，完整页面以原站截图和样式为准。
