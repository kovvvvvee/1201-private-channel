# Step 16 fix3 — 正式部署报告

## 版本信息

- **Commit**: `cafc321` — "Step 16 fix3 stable: image/font loading fixes (fix1+fix2+fix3 batch)"
- **稳定标签**: `step16-fix3-stable`（已推送 origin）
- **部署时间**: 本次会话（push 后 Vercel Git 集成自动构建部署）
- **部署地址**: `https://1201-private-channel-rcw9-dun.vercel.app`
- **部署方式**: `git push origin master` → Vercel Git 自动部署（项目原有流程；`api/chat.js` 为 Vercel Serverless Function，走真实 DeepSeek）

## 部署内容确认

本次提交包含 Step 16 fix1+fix2+fix3 全部已验收修改（此前均未提交）：

- Message 壁纸 `message-bg.webp`（284KB→25KB）+ preload ✅
- 信纸 Ma Shan Zheng 字体子集全量覆盖（207 字符，83KB）✅
- Chat 背景 `chat-bg.webp`（107KB→72KB）+ preload ✅
- Collection 当前卡优先加载、`fetchpriority=high`、Live Photo 播放健壮性 ✅
- fix1/fix2 全部修复（气泡尾巴、标点过滤、头像、信封信纸、webp 照片等）✅
- `.step12-test` / `.step15-deploy` / `.step16-fix1` / `.step16-fix2` / `.step16-fix3` 全部报告与测试记录已入库 ✅
- `dist-mock` 已加入 `.gitignore`，**未进入版本库**（mock 构建不污染仓库）
- 原始 jpg/png/mp4/字体资源全部保留 ✅
- 密钥扫描：staged 内容无 `sk-*`/API key；`.env` 未入库 ✅

## 构建信息

- 构建命令：`npm run build`（Vite 5.4.21，产物 `index-DQeBDEOW.js` / `index-BF72HsLz.css`）
- 部署前本地已构建 dist + dist-mock 验证通过
- **生产实际服务验证**：`/assets/index-DQeBDEOW.js` 在 Vercel 返回 200 且内容为最新 bundle —— 确认线上是新构建而非旧缓存

## 生产环境验证（真实浏览器 CDP，390×844，冷缓存）

| 检查项 | 结果 |
|---|---|
| 首页打开 | PASS |
| Message 开屏壁纸 | PASS — `message-bg.webp` 25846 B 已加载 |
| 信纸字体完整性 | PASS — 逐字审计 207/207 字符有 Ma Shan Zheng glyph，无混排 |
| Chat 背景 | PASS — `chat-bg.webp` 72150 B 已加载 |
| Chat 真实 API 交互 | PASS — 发送"生日快乐"收到 DeepSeek SSE 流式回复 |
| 生产非 mock 构建 | PASS — 无 mock 拦截特征，走 `api/chat.js` 真实端点 |
| Collection 进入 | PASS — `/collection` 路由正常，`.photo-container` 渲染（图片加载问题按要求不在本次范围） |

注：prod-verify.mjs 中 Collection 断言因脚本选择器问题报 FAIL（`clickEl` 未命中 `.nav-button`），已用独立脚本 `prod-collection.mjs` 实测确认 Collection 正常进入，属测试脚本问题而非产品问题。

## 环境备注

- 本机直连 `*.vercel.app` 超时（网络限制），Edge 浏览器经系统代理可正常访问，所有验证均在真实浏览器完成。
- Push 首次因传输量较大（133 文件含截图/报告）耗时较长，重试后成功；SSH 认证正常（`kovvvvvee`）。

## 回滚方式

- 代码回滚：`git revert cafc321` 或 `git reset --hard 323073b` 后 push（会触发 Vercel 重新部署旧版）。
- 标签回滚：`git checkout step16-fix3-stable` 可恢复本稳定点；更早稳定点为 `323073b`。
- Vercel 侧亦可在 Dashboard 将 deployment 置回前一版本（Instant Rollback）。

## 未解决/遗留

- Collection 图片加载与 Live Photo 的剩余问题按要求未处理，遗留至后续步骤。
- 生产 Chat 已恢复真实 DeepSeek API（消耗 API 额度）；mock 仅存在于 `dist-mock` 构建与 `vite.mock.config.js`，不影响生产。

**状态：部署完成，等待审查。**
