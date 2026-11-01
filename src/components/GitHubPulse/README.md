# GitHubPulse

独立的装饰性 GitHub 动态组件，柱图在上、6 行消息在下；不依赖首页回调、路由或快速阅读。样式随组件一起导入，移动整个目录即可复用。

```tsx
import GitHubPulse from "./components/GitHubPulse";
<GitHubPulse />;
// 可选：className、endpoint（observatory API 路径）、tickMs（默认 1800ms）。
```

当前挂载点在 `src/ExplorerApp.tsx` 的 `.discovery-hero` 右栏；移动该 JSX 即可改变位置。宽度随容器变化，单独使用时默认最大 680px，继承站点主题变量并提供默认色；手机排列在标题和搜索栏下方。

数据：`GET /api/observatory/pulse` → `server/pulse.mjs`，服务端缓存 60 秒并合并并发；浏览器每 75 秒读取，每 1.8 秒逐条回放真实样本。OSSInsight 公共 API 提供约 5–6 分钟前的公开事件及 5 秒事件计数；柱图代表活动量下限，不是 commit 总数。失败时使用持久化缓存，再回退到 GitHub 事件；没有统计数据时不生成假柱。缓存目录沿用 `OBSERVATORY_DATA_DIR`。

悬停、键盘焦点、离屏及后台时停止轮播和自动请求；暂停键可手动停止。系统偏好减少动画时默认暂停，仍可手动播放。来源、抓取日期、数据口径收在信息按钮中。消息在新标签页打开 GitHub 原始事件或对应仓库栏目，不改写事件时间。

`PulseChart.tsx` 独立管理柱图：真实样本条带无缝横向循环，更新时保留柱子的 DOM，用约 950ms 的缩放缓动衔接新高度；初次展示依次升起。指针保持普通箭头。悬停或手机点按显示时间、次数与采样间隔的小详情卡，靠近边缘时限制位置，顶部空间不足时显示在下方。图表支持键盘左右键、Home/End 查看、Escape 关闭；查看详情时停止流动。减少动画偏好关闭横移及过渡。
