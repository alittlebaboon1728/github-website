# 设计系统：银灰液态玻璃

目录：基准与最终级联；色板；背景与玻璃；字形；版面；图标与状态。

## 基准与取值

基准源代码提交 `e26957a`，2026-11-09 的正式站。`../assets/visual-reference/` 有 1440×1000 和 390×1000、浅色和深色的 34 张实景截图。包含首页、卡片、阅读弹窗、榜单、试用目录、试用阅读、空对话和本机后台；手机另有导航展开截图。

`computed-styles.json` 记录浏览器最终值，含每页根变量和组件属性。截图使用减少动画，所以其中的 transition 不代表正常动画参数；正常动画见 motion-and-performance.md。光学适配器异步给可见元素安装滤镜，某一帧没有 URL 不等于永远不折射。

当前背景是银灰／石墨，文字仍带少量绿。不能仅根据 frosted-glass.css 的根变量抄成纯灰文字：生产构建把后台与前台共用玻璃抽到共享 CSS，前台 main 样式在其后加载，部分根变量最终来自 refined-theme.css。后台根变量则来自共享玻璃。下表记录实际结果；起步 CSS 已将前台最终值平铺，无需保留历史级联。卡片显式26px，根 --panel-radius 的20px不决定所有组件。

## 色板

前台语义变量：

| CSS 变量 | 浅色 | 深色 | 角色 |
| --- | --- | --- | --- |
| --page | #f8faf9 | #151c1b | 无玻璃背景回退 |
| --card | #ffffff | #1d2724 | 实色／辅助面板 |
| --text | #202d2b | #e8efeb | 主要文字 |
| --secondary | #626f6b | #b1bfb8 | 副标题、次要资料 |
| --muted | #697570 | #a0b1a8 | 时间、来源 |
| --border | #e1e8e4 | #33413b | 内容分隔 |
| --forest | #216859 | #a4d5bd | 选中、图标、焦点 |
| --accent | #337c6c | #87bda8 | 小范围强调 |
| --sage | #e6f0eb | #2b4338 | 轻选中与标签 |
| --soft | #f0f4f2 | #25322c | 柔和底 |
| --feature-bg | #f0eff7 | #252430 | 柔紫功能底 |
| --feature-border | #e4e2ee | #3d394c | 柔紫边 |
| --feature-accent | #6a5b87 | #bdb0d8 | 柔紫文字 |

后台与源码灰色语义层：浅色 page #f3f4f5、card #fafbfc、text #202326、secondary #5c6268、muted #626a72、border #cdd2d94d、soft #e7eaed、forest #28685e、sage #e0ebe7；深色对应 #15171b、#23262c、#f1f2f4、#b9bdc5、#aeb5bf、#bfc7d41f、#2c3038、#acd9cd、#324942。制作后台可采用这一层，材质和前台相同。

玻璃最终变量（八位 hex 的最后两位是透明度）：

| CSS 变量 | 浅色 | 深色 |
| --- | --- | --- |
| --glass-clear | #ffffff14 | #ffffff08 |
| --glass-panel | #ffffff1a | #ffffff0f |
| --glass-sheet | #f8f9fbe6 | #24272fe8 |
| --glass-hover | #ffffff70 | #ffffff14 |
| --glass-edge | #ffffff45 | #ffffff14 |
| --glass-highlight | #ffffff52 | #ffffff1a |
| --glass-lowlight | #303d510b | #00000055 |
| --glass-selected | #ffffffa3 | #ffffff17 |
| --glass-specular | #ffffff4a | #d5e4ff0a |
| --glass-primary | #ffffff70 | #ffffff1c |
| --glass-primary-hover | #ffffffa3 | #ffffff29 |

## 背景和材质

背景固定占据视口，应用根 isolation:isolate，伪元素 fixed/inset:0/z-index:-1，不能盖住点击。滚动时内容经过背景，背景不随每张卡片重复绘制。

浅色背景，从上到下叠层：

```css
radial-gradient(ellipse 60% 70% at 100% 70%, #b9c7d773, transparent),
radial-gradient(ellipse 48% 55% at 0% 48%, #c1d2cd66, transparent),
radial-gradient(ellipse 60% 50% at 55% 0%, #ffffffed, transparent),
linear-gradient(145deg, #f3f4f4, #e9edef 65%, #e0e6ed)
```

深色背景：

```css
radial-gradient(ellipse 60% 70% at 100% 70%, #40537155, transparent),
radial-gradient(ellipse 48% 55% at 0% 48%, #334c4540, transparent),
radial-gradient(ellipse 60% 50% at 55% 0%, #3b404233, transparent),
linear-gradient(145deg, #1b1e22, #171c23 65%, #202833)
```

普通玻璃顺序：移动微光、静态 sheen、半透明底。微光为 ellipse 220px 130px at var(--glint-x,25%) var(--glint-y,0%)，颜色 specular 到 transparent 100%。静态浅 sheen 为 linear-gradient(140deg,#ffffff26,#ffffff00 44%,#ffffff0d)，深色 #ffffff06 → #ffffff00 → #ffffff02。移动微光只对支持鼠标且未减少动画/透明度的设备按需更新。

普通控件滤镜 blur(18px) saturate(125%)，面板 blur(28px) saturate(115%)。控件阴影：顶内侧0.5px highlight、底内侧-0.5px lowlight、外部 0 3px 9px -4px #1f29391a（深色#00000045）；面板顶内光、0 12px 36px -24px #1f293924（深色内光#ffffff12、外部#00000066）。

真实折射安装后改用 blur(12px) saturate(150%) brightness(1.025) url(#...)；深色brightness1.08。折射控件blur8，弹窗及菜单blur20。surface阴影为 inset 0 .5px 0 --lgh-top-light, inset 0 -.5px 0 --lgh-bottom-shade, 0 5px 16px -6px --lgh-shadow, 0 12px 28px -18px --lgh-shadow。三个变量浅色#ffffff52/#2833470d/#25314510，深色#ffffff24/#00000029/#0000002b。

1px外描线保持低透明，不加第二圈强白边。SDF已提供边缘形变时去掉旧绘制光学轮廓。图文清楚，没有内容抖动、卡片倾斜或彩虹光晕。阅读弹窗用sheet，不能把所有正文面板都设成clear。

## 字形与层级

| 用途 | 字体 | 大小／字重／行高／字距 |
| --- | --- | --- |
| 前台正文 | Manrope, Microsoft YaHei, sans-serif | 基准16px/400；组件各自覆盖 |
| 中文首页主标题 | Editorial CN, Manrope, Microsoft YaHei | clamp(44px,4.7vw,64px)/600/1.32/-2px |
| 英文首页副题 | Instrument Serif, Georgia, serif；italic | clamp(25px,2.4vw,32px)/400/1.2/-.4px |
| 站点名 | Manrope | 15px/750；不靠变字重做选中 |
| 卡片项目名 | Manrope + 中文回退 | 22px/700/-0.65px；手机18px |
| 卡片概括 | 正文字体 | 14px/1.9；最多5行 |
| 作者／资料 | 同上 | 作者12px，来源与统计11px |
| 标签 | 同上 | 11px；柔和底 |
| 控件 | 同上 | 14px/550/1.4；导航13px/600，手机11px |
| 阅读大标题 | 同上 | 桌面32px；按手机宽度收紧 |
| 后台 | Manrope Variable, Microsoft YaHei, PingFang SC | 14px/1.6 |

Manrope和DM Sans是本地WOFF2（fontsource），font-display:swap；最终前台family为Manrope，DM Sans是基础文件的早期声明。Instrument Serif是regular/italic两款400。中文艺术字体为 /fonts/editorial-zh.ttf、600，仅站内自定义。此包未分发该字体；精确复现需获授权的同字体，或使用用户已有编辑式中文字形。不要把系统回退宣称为像素级字体复现。

<=820主标题clamp(40px,7.2vw,58px)，tracking-1.4px；390视口实际40px/52.8px。手机英文26px，margin14px 0 26px 2px；桌面margin18px 0 34px 2px。标题两行，星芒单线小符号约.64em、轻转-12°，辅助而不抢文字。

## 版面与节奏

- 内容max-width1248、width100%、padding-inline40，内净宽1168。<=820用28，<=600用20。390视口在桌面浏览器保留两侧滚动槽后净宽320；原生手机无常驻滚动条时重新计算。
- 页头sticky top0/z45，外部padding-top12；内部max1200、widthcalc(100%-48px)、min-height64、padding0 18、gap24、圆角999。<=600：widthcalc(100%-24px)、min-height62、padding-inline10、gap8、上方8。
- 主视觉左右1.15:1，gapclamp(36px,5vw,76px)，上下48。<=820单列gap32，上下40/42；<=600上下36/28。
- 双列自然瀑布流，横向24；grid-auto-rows1px，量高后设置span，不能等高强撑。<=600单列gap18，不留原span。保持DOM与键盘顺序。
- 圆角按功能：胶囊999；卡片26；封面17；阅读弹窗28；手机导航24；试用横幅28、手机22；标签7。不能全部统一20。
- 按钮高度44、水平padding18、图文gap8；标签说明可比按钮紧凑，手机不能靠缩小点击区塞一行。

## 图标和状态

原站lucide-react单线SVG，常见16–20px；flex-shrink:0、display:block，容器inline-flex居中。手机主题/菜单按钮44×44、gap8。不要用Unicode字符或原生details三角，避免基线错位。筛选chevron16、独立占位、展开旋转90°。图表和标签以低饱和绿为主，具体功能封面可扩大配色。

hover轻提亮／文字转forest；focus-visible 2px forest、offset4（搜索自身由整条focus-within细环承担）；disabled opacity约.5并阻止操作；selected由水滴或半透明底呈现。主按钮不恢复大块深绿实底。深色主题单独定义边／字／阴影，不能套invert。

减少透明度用实色card并移除backdrop；无backdrop-filter支持同样回退。减少动画直接落位，读内容不等待动效结束。
