# 银灰液态玻璃 UI 风格与可复用技能

记录日期：2026-11-09。视觉基准为代码提交 `e26957a` 对应的实际运行界面；本次将手机导航改动先推送 GitHub，随后提取完整风格。没有修改网站业务、清理缓存或重新生成内容。

可复用技能名：`silver-liquid-glass-ui`。版本化副本在 [技能入口](../skills/silver-liquid-glass-ui/SKILL.md)，个人安装位置为 `C:\Users\23366\.codex\skills\silver-liquid-glass-ui`。技能自包含，不依赖 `G:\github_website`、原后台或本地4173服务；其他项目可以整体复制使用。

后续会话可这样调用：

```text
使用 $silver-liquid-glass-ui，为这个项目制作前端。
沿用开源观测站的银灰薄玻璃、深浅主题、排版和水滴导航，保留当前业务内容。
```

## 完整风格记录

| 文档 | 内容 |
| --- | --- |
| [设计系统](../skills/silver-liquid-glass-ui/references/design-system.md) | 实际色板、渐变、透明度、薄边高光、阴影、字体层级、间距、断点和图标状态 |
| [组件规格](../skills/silver-liquid-glass-ui/references/components.md) | 导航、搜索、动态仪表、筛选、自然高度项目卡、阅读弹窗、对话、榜单、试用封面与后台 |
| [动画和性能](../skills/silver-liquid-glass-ui/references/motion-and-performance.md) | 水滴完整关键帧/曲线、手机菜单保留与收起、光学调度、按压、可访问回退与缓存策略 |
| [复用代码与来源](../skills/silver-liquid-glass-ui/references/implementation.md) | 独立代码使用、CSS级联差异、原始快照索引、字体与第三方许可、验证边界 |

当前是银灰/石墨渐变背景、低饱和绿文字、轻薄玻璃。主标题是中文艺术字与 Instrument Serif 斜体英文，项目两列自然瀑布流、手机单列。导航只有一个持续存在的水滴；手机切页不收起菜单，外部用户手势或Escape再收起。手机主题与菜单按钮44×44且有玻璃底；搜索和动态控制保留裸图标。

记录采用浏览器最终值。生产CSS跨入口提取后，前台部分根语义仍来自refined-theme，后台为frosted-glass灰色；玻璃高specificity规则继续生效。起步代码已平铺前台最终值，避免迁移时无意改变现有配色。旧DESIGN历史配色、旧Lens WebGL和厚白边不属于本次基准。

## 视觉与代码资产

[视觉参考目录](../skills/silver-liquid-glass-ui/assets/visual-reference/) 包含34张1440/390视口、深浅主题的真实截图及 [计算样式](../skills/silver-liquid-glass-ui/assets/visual-reference/computed-styles.json)。覆盖首页、卡片、阅读弹窗、榜单、试用目录/阅读、空对话、本机后台及手机展开导航。截图使用减少动画便于对比，正常动画参数另行记录。后台截图等到真实运行概览就绪后捕获，未执行后台操作。

[原始快照](../skills/silver-liquid-glass-ui/assets/original/source-manifest.json) 保存33个视觉源文件的字节数与SHA-256。所有活跃前台CSS、后台CSS及关键视觉组件都随技能保留，之后无需依赖原仓库追溯细节。

[起步代码](../skills/silver-liquid-glass-ui/assets/starter/) 提供平铺CSS、React按钮/选项组、原始水滴hook、菜单状态hook、光学/鼠标微光hook、框架无关SDF适配器和 [静态示例](../skills/silver-liquid-glass-ui/assets/starter/demo.html)。Manrope和Instrument Serif本地WOFF2随完整SIL OFL1.1许可附带；Liquid-Glass-HTML原始SDF及MIT许可保留。原中文艺术TTF未打包，其字形名、字号和引用方法已记录，精确复现需使用有权使用的原字体。

## 验证与维护

已完成技能元数据验证、React/TypeScript严格类型检查、文档链接及33个源快照哈希校验。新增代码在独立本机HTTP服务验证了8组React起步代码（桌面/手机×深浅×正常/减少动画）和4组静态示例；检查导航DOM和菜单持续存在、后退、程序滚动、外部点击与触摸、Escape焦点、44px按钮/SVG居中、水滴落点、裸图标排除、真实光学安装、减少透明度回退与卸载清理。12组均通过，无页面异常和横向溢出；报告在本机 `.build/ui-skill/report.json`，不提交构建产物。

正式站34张截图只读取GET，未发起浏览器生成POST，无页面异常/溢出。此前33项手机导航业务覆盖和生产构建沿用上一轮结果，本次未重跑无关业务套件。正式站当前仍为PID20536，本机 `http://localhost:4173`、内网 `http://10.210.222.65:4173`。

维护工具（在原仓库根执行）：

```powershell
node scripts/capture-ui-style.mjs
node scripts/prepare-ui-skill-assets.mjs
node scripts/verify-ui-skill.mjs
python -X utf8 C:\Users\23366\.codex\skills\.system\skill-creator\scripts\quick_validate.py skills/silver-liquid-glass-ui
```

未来重新捕获时先核对脚本记录日期/源提交，并同步文档与个人安装副本。原始快照不要手工格式化，否则会失去哈希一致性。技能复制到其他产品时保留其栏目和业务，按需调整数量/内容；不要把原站API、临时对话规则或GitHub标志强制迁入。
