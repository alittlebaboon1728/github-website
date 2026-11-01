# GitHub 与内网部署

## 环境与配置

使用 Node.js 22.10+ 或 24，执行 `npm ci` 安装锁定的依赖。复制 `.env.example` 为 `.env.local`，按需配置 GitHub 只读令牌、DeepSeek 和 GPT 接口。密钥只在服务端读取，`.env.local`、`api.txt`、数据缓存和构建目录不提交 Git。

```powershell
npm ci
Copy-Item .env.example .env.local
# 编辑 .env.local 后构建
npm run build
```

## 在本机提供内网访问（Windows）

```powershell
npm run lan:start
npm run lan:status
npm run lan:stop
```

启动命令在后台运行正式 Node 服务，默认监听 `0.0.0.0:4173`，同时提供前端文件和后端 API。终端会显示这台电脑当前的局域网地址；其他设备使用同一内网，通过该地址访问。电脑需要保持运行，内网地址可能随网络变化。

服务使用独立的 `.data-lan/`，首次启动自动复制 `.data/` 中已有的 JSON 资料；已有内网数据不会被后续启动覆盖。开发服务仍使用原来的 `.data/`，两个进程不会同时写入一个目录。日志和进程记录在 `.build/lan/`。重复启动复用当前服务，停止命令只关闭该脚本启动的项目进程。

更新页面或服务代码后重新构建，再重启内网服务：

```powershell
npm run build
npm run lan:stop
npm run lan:start
```

如果 Windows 防火墙阻止内网访问，在管理员 PowerShell 中执行项目提供的端口配置脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/enable-lan-firewall.ps1
```

脚本新增一条仅允许本地子网访问网站 TCP 4173 端口的规则，保留现有防火墙设置。校园/企业 Wi-Fi 若启用了设备隔离，需要改用允许设备互访的内网或由网络管理员配置。

## 部署到另一台内网服务器

拉取仓库、安装依赖，单独配置服务器的 `.env.local`，执行 `npm run build` 后用 `npm start` 启动。通过 `PORT` 和 `HOST` 设置监听地址。该站点包含 GitHub 代理、AI 生成、任务状态与缓存，部署需要 Node 后端一起运行。

使用系统服务管理器维护进程，且每个 `OBSERVATORY_DATA_DIR` 只允许一个进程写入。迁移已有试用或缓存时，在停服后单独复制数据目录；密钥与生成数据不在 Git 仓库内。

## GitHub 同步

项目首次上传为私有仓库。后续修改可使用：

```powershell
git add .
git commit -m "Describe the change"
git push
```

所有构建资源、运行日志、依赖、API 密钥和本地数据均通过 `.gitignore` 排除；源代码、说明文档、测试与复验截图会保留。
