# 可复现的项目试用模板

2026-11-01，以用户确认的原生 Excalidraw 页面作为基准。模板标识：`readable-trial-v1`。

## 固定的内容与界面

`shared/project-trial-template.json` 保存固定栏目、模板版本和已核对的 Excalidraw 中文范例。前端通过 `projectTrialSections.ts` 读取，服务端生成提示词也读取同一文件。Excalidraw 的介绍与使用方法直接取自该范例，避免文档、提示词与页面各维护一份内容。

页面顺序是“项目介绍 → 使用方法 → 动手体验 → 正式使用”，补充相关资料与使用须知。`ProjectTrialReading` 提供默认可读的 README 中文说明，`ProjectTrialSteps` 提供直接可见的操作与结果。原生和生成项目共用组件、字体及排版；四步以上在桌面用两列，手机单列。

交互/流程只在下方“动手体验”有一个打开入口，点击前不运行生成代码。去掉生成页旧的打勾任务侧栏，步骤可直接阅读。外部在线工具或视频的打开入口只出现在体验区。项目名称、中文正文、练习、正式使用方法随项目变化，模型不决定栏目和页面导航。

主站控件复用 `GlassButton` 和共享玻璃样式。沙箱内由 `trial-sandbox.css` 注入宿主的材质变量，按钮的圆角、透明度、内边距和最小高度也遵循统一规则，主题切换同步更新。生成 HTML 只负责实际练习；原生 Excalidraw 编辑器自身样式保持上游设计。

## 生成与校验

`server/trials.mjs` 在真实 README 基础上要求额外的 `reading.introduction` 与 `reading.usage`：前者说明是什么及具体用途，后者讲真实项目怎么用及输入输出。`steps` 专门解释本次示例，必须与生成控件名称和结果对应。服务器检查中文说明、步骤、边界、链接及 README 原文证据，仍保留一次自动修正、沙箱和持久缓存。

新结果保存 `templateVersion`；旧结果保持可读，缺少 `reading` 时使用已有简介和正式使用说明，不会自动重做或消耗模型额度。相同项目普通提交返回已有结果；主动重新生成才替换。这里复现的是模板、流程与已保存的结果，不承诺再次调用生成模型会逐字产生同一正文。

后续补充：生成输出还提供 `cover` 结构，描述用途图的布局、中文用途、输入示例和对应结果，供列表卡片与首页共享轮播复用。既有项目配图无需重做整份试用，具体规则见 [TRIAL_SHOWCASE.md](TRIAL_SHOWCASE.md)。

## 复现步骤

启动现有开发服务后，在项目“快速了解”中点击“生成项目试用”；生成结束后进入详情，先读中文说明，再从下方打开练习。

也可以在工作区使用相同接口：

```powershell
node scripts/generate-project-trial.mjs markedjs/marked
```

脚本提交请求、输出阶段变化并等待完成；已有结果直接复用。服务地址默认 `http://127.0.0.1:5173`，可设置 `TRIAL_BASE_URL`。脚本不读取密钥；模型配置仍只由服务端读取。需要明确重做时添加 `--regenerate`，这会使用模型额度。

```powershell
node --test tests/trials.test.mjs
npx playwright test tests/trials.spec.ts
node scripts/verify-trial-template.mjs
```

最后一条命令只读取已保存的真实 Marked 试用，验证说明、唯一入口、转换、空输入、原始 HTML 拒绝、重置、刷新复用及深浅主题/手机布局，不触发模型。

## 新项目实测

新增 `markedjs/marked`，由 `gpt-6.1-sol` 于北京时间 2026-11-01 14:08:52 依据真实项目 README 生成，结果保存在 `.data/project-trials.json`。未手工替换模型生成正文或交互代码。

练习“把 Markdown 变成网页内容”：输入 `# 本周更新` 和 `修复了 **登录问题**。`，点击转换，得到对应标题/加粗 HTML 和预览。空输入显示中文提示，原始 HTML 被练习拒绝，重置恢复预置发布说明。它是本地教学模拟，未运行 Marked 本体；真实 Marked 本身不净化输出，说明已根据 README 明确区分。

地址：`http://localhost:5173/#/trial/markedjs/marked`。再次使用生成脚本返回 `reused: true`，时间戳不变。

验收：8 项服务端试用测试、11 项相关浏览器测试通过；生产构建通过（保留原有大分包提示）。真实 Marked 在浅/深主题 × 390/1440px 的 4 组操作及布局检查全部通过，无横向溢出或页面错误；测试访问、刷新和主题切换没有 POST 请求。已查看桌面和手机的阅读与交互截图，证据在 `docs/screenshots/trial-template/` 与 `.build/trial-template-*.log`。
