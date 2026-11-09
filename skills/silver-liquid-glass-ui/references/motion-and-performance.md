# 动画、光学与即时反馈

目录：水滴关键帧；手机菜单；微交互；光学调度；缓存；验收。

## 持续存在的水滴

`../assets/starter/useDropletIndicator.ts` 可直接复制（React19/TypeScript）；容器relative，水滴absolute left0/top0、transform-origin:center、pointer-events:none。目标从aria-current=page或aria-pressed=true取得；不是每个按钮各画active背景。

先读取当前渲染transform的DOMMatrix，再取消未完成动画。按新目标宽高重算起始比例和中心偏移，否则连点会跳回上一次目标。只在目标变动时动，布局或字体重排直接对齐。

设A为起点、B目标、d距离、w目标宽，stretch=min(.22,d/max(w,1)*.1)：

| 时间offset | 位置 | scaleX / scaleY | easing |
| --- | --- | --- | --- |
| 0 | 当前渲染位置 | 当前实际比例 | cubic-bezier(.22,.7,.3,1) |
| .42 | A到B的62% | 1+stretch / 1-stretch*.42 | cubic-bezier(.2,.6,.25,1) |
| .76 | A到B的101.5% | .97 / 1.025 | cubic-bezier(.2,.7,.3,1) |
| 1 | B | 1 / 1 | 默认 |

duration=min(560,410+d*.3)ms。ResizeObserver观察轨道和项目，document.fonts.ready后再对齐。减少动画取消WAAPI直接落位；卸载disconnect observer、remove media listener、cancel animation。原hook初始化观察已有项目，动态增删导航应补观察新节点或重建观察。

## 手机菜单

<=820，菜单常驻DOM。关闭：opacity0、translateY(-8px) scale(.98,.94)、clip-path:inset(0 0 100% 0 round 24px)、pointer-events:none、visibility:hidden。visibility延迟240ms保留收起过程；inert/aria-hidden立即生效，不能隐藏后仍Tab到链接。

打开：opacity1、transformidentity、clip-path:inset(-40px round 24px)、visibilityvisible、pointer-events:auto、transition-delay0。opacity160ms ease；transform/clip-path240ms cubic-bezier(.2,.8,.2,1)。负inset不裁水滴阴影。

开关状态在路由壳，切页/后退不重置，导航点击不setOpen(false)，这样能看见水滴跨项移动。只在头部以外pointerdown/touchmove/wheel收起；不监听所有window.scroll关闭，程序恢复位置和高度变化也会触发scroll。Escape关闭并focus菜单按钮preventScroll。打开时安装监听、关闭/卸载清理；桌面不应用mobile-open。usePersistentMenu.ts提供外部手势机制。

## 微交互

- 通用hover背景/边200ms、shadow240、文字160，scale300ms cubic(.2,.8,.2,1)；导航文字180，字重固定600。
- 普通按压可用.97/100ms；折射按钮最终scale1.025、200ms cubic(.34,1.56,.64,1)。后者覆盖前者，勿叠两种弹性；裸图标不放大玻璃底。
- 搜索模式、自定义select弹层约220ms缩放/裁切/渐隐，保留退出DOM。native base-select只在支持时增强，其它浏览器保留可键盘操作的native select。
- 鼠标微光只在hover:hover、pointer:fine且motion/transparency均no-preference时启用；事件合并一个RAF，不维护永久循环，不经React setState重渲染所有卡，不移动文字。
- 轮播hover/focus/touch/减少动画暂停，不夺走交互。

## 原始光学与性能边界

来源Weiqin-Mo/Liquid-Glass-HTML，上游c6810701752f20098137cd719300dc8b6aa02d3f，MIT ©2026 NightS.，致谢WoodChen。SDF→Canvas位移图→SVG feImage＋feDisplacementMap→backdrop-filter；不是只blur，也不能给前景文字套filter。保留vendor/LICENSE与Thanks.txt。

- IntersectionObserver仅准备可见元素，离屏释放分配；ResizeObserver/MutationObserver管理尺寸和卸载。
- 位移图最大边512px、像素131072，scale按缩放比补偿；不按DPR无限放大。
- cache按尺寸/圆角/强度/视口clamp复用；64项或4MiB是清理目标，被引用entry不强删，所以不是绝对内存上限。
- 一批约7ms，setTimeout16ms分片；单图仍可超过7ms，预算不是硬实时。
- 滚动停止160ms后更新clamp，不逐帧重建。document.hidden暂停并释放分配，恢复补可见元素。
- strength：control .9、header/search1.2、surface .75，distortion .6；异常时清掉滤镜保留磨砂。
- 完整SVG backdrop仅Chromium/Edge启用，Safari/Firefox磨砂回退；CSS.supports通过也不能证明其它引擎可靠。
- 减少透明度实色并卸载滤镜；减少动画仍可保留静态折射。

便携适配器使用data-glass-surface/data-glass-control，data-glass-strong用于header/search强度，data-glass-bare/data-glass-exclude退出。一个节点勿同时标surface/control。canvas、代码编辑器、第三方嵌入根加exclude，外层可继续玻璃。

## 缓存与切换

即时反馈不能仅用装饰动画遮慢请求。有对应数据层时：同key共享GET缓存/并发合并；切条件立刻读正确key旧结果、后台刷新；分别保存分页和滚动。按pointer/focus/touch意图预取，空闲有限串行预热，不同时拉所有分类大图。

字体与首屏本地化，图片明确尺寸/比例、响应式WebP/srcset，关键图优先，其余lazy、decode async。中文概括服务端长期缓存、后台补齐、客户端直接读；迁移UI不意味着自动接入模型或对GET生成付费内容。

原站预热服务和缓存数据库不随技能复制；按目标真实数据实现。未知/失败范围保留匹配旧内容并给重试，不伪造就绪。

## 验收

按范围检查1440/390及必要时820/821、light/dark；连点、Tab/Enter、后退、字体对齐；菜单开着切页仍开、外部点击滑动收起、程序scroll不关闭；主题/菜单/筛选图标居中；长名称不溢出；阅读底部和输入适配safe-area；减少动画无运动且功能可用、减少透明度实色。

确认只折射背景，卸载不留SVG/observer，离屏不持续生成。纯样式demo只能证明样式/交互，不据此宣称真实搜索提速或所有引擎像素一致。
