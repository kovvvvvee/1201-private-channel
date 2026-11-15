# 1201｜隔离移动端体验版部署报告（故障排查与恢复）

日期：2026-11-15
性质：移动端体验测试部署，非正式上线。全程 Mock 聊天，未接真实 DeepSeek API。

---

## 1. 上次失败的真实原因（已查明，非推测）

| 环节 | 事实 |
|---|---|
| 部署方式 | Vercel 匿名临时部署 `https://sonic-maple-xczk7cw.tmp.now`（60 分钟过期）+ localhost.run SSH 隧道 `https://8af1f04bcb7712.app.lhr.life` → 本地 `dist-mock` 静态服务 :4174 |
| `no tunnel` 根因 | localhost.run **免费隧道会周期性轮换域名**。SSH 进程仍存活，但隧道已迁移到新域名 `6861e03e35a563.app.lhr.life`，旧域名 `8af1f04bcb7712` 返回 `no tunnel` 错误页 |
| 页面卡死根因 | localhost.run 免费层**限速约 10–20KB/s**（实测 JS bundle 196KB 需 20s）。浏览器 `readyState` 长时间停在 `interactive`，`.start-icon` 在脚本 10s 等待内不出现 → `clickSelector` 抛错 → 脚本 FATAL 退出 |
| 报告未生成原因 | 上一轮验证脚本是一次性流程，无失败兜底/报告输出逻辑，中途异常即终止，未写任何报告文件。本轮已按要求补齐 |

## 2. 本地服务检查结果

- `dist-mock/` 生产构建产物完整（index.html + assets + 全部静态资源）。
- `vite preview` 因 Vite 5 `preview.allowedHosts` 拦截隧道域名（403），弃用。
- 改用零依赖静态服务器 `.step12-test/static-server.mjs`：监听 `0.0.0.0:4174`，SPA fallback、不校验 Host、对 html/js/css/json/svg/txt 做 gzip（JS 196KB→66KB）。本地 `curl http://localhost:4174/` = 200 且返回 1201 页面 HTML。

## 3. 隧道工具及启动方式

| 工具 | 命令 | 结果 |
|---|---|---|
| localhost.run | `ssh -R 80:localhost:4174 nokey@localhost.run` | 进程存活但**域名轮换+限速**，弃用 |
| **pinggy.io（采用）** | `ssh -p 443 -R0:localhost:4174 a.pinggy.io` | 隧道建立成功，进程持续运行中 |

**当前可用地址：`https://sheyh-36-28-220-14.run.pinggy-free.link`**
备用：`https://xyaog-36-28-220-14.free.pinggy.net`（同一隧道的第二域名）

注意：pinggy 免费隧道 **60 分钟后过期**；首次访问会出现 pinggy 警告页，需点击 **Continue/继续访问** 按钮一次（脚本中以 `access()` 等效通过，实测生效）。

## 4. 修复过程和修改/新增文件

未修改任何网站业务代码。新增/修改均为部署链路文件：

| 文件 | 说明 |
|---|---|
| `vite.mock.config.js`（新增） | 隔离构建配置：独立 `outDir: dist-mock`，通过 `transformIndexHtml` 向 `<head>` 内联注入 mock-fetch 脚本，拦截 `fetch('/api/chat')` 返回本地 SSE。正式 `vite.config.js`/`dist/` 不受影响 |
| `dist-mock/`（构建产物） | 体验版静态产物 |
| `.step12-test/static-server.mjs`（新增） | 零依赖静态服务器（gzip + SPA fallback） |
| `.step12-test/step15-*.mjs`、`dbg-*.mjs` | 部署验证/调试脚本 |
| `.step15-deploy/REPORT.md` | 本报告 |

**明确未修改的后端/业务文件**：`api/chat.js`、`api/test.js`、`server/index.js`、根目录 `index.js`、`src/` 全部业务代码、`vite.config.js`、`package.json`、密钥与 API 配置——均未改动。

## 5. 公网访问验证结果（真实 Edge + CDP，穿透 pinggy 隧道）

13/13 PASS：

- 首页进入（Launch → Home）、home-bg.webp / 角色 webp 加载 ✅
- Collection：9 卡渲染 + Live Photo `<video>` 播放 ✅
- Message：信封显示、信纸内容正常 ✅
- Chat：badge=12、loading 状态（`正在输入...`）、mock 回复逐条气泡、12→11 ✅
- Mock 故障注入：消息含「失败」→ HTTP 500 → 错误提示 + 输入框恢复 ✅
- 刷新页面回到 Launch ✅
- 375px 抽查：Home 导航不越界、Chat 输入框可见、无横向溢出 ✅

## 6. Mock 隔离与 Network 安全检查

- `window.fetch` 仅拦截同源 `/api/chat`：正常消息 → 本地 SSE 流式回复（4 句池轮换，600ms 延迟模拟加载）；含「失败」→ 500。
- Network 抓包：**0 条 `/api/` 真实请求、0 条 deepseek/openai 外联**；唯一外部请求为 Google Fonts 字体 CDN（index.html 原有，无密钥）。
- `dist-mock` 产物扫描：无 `DEEPSEEK`/`sk-`/`Bearer`/密钥字符串。

## 7. 进程状态

- 静态服务器 `:4174`：运行中（shell `730ce6`）。
- pinggy SSH 隧道：运行中（shell `e622d4`），60 分钟有效期。
- 两者在测试期间持续可用，已实测多次请求成功。

## 8. 报告生成流程

本轮验证脚本带断言明细输出；本报告已实际写入 `.step15-deploy/REPORT.md`。后续如需固化，可将"本地服务→隧道→公网验证→写报告"封装为单脚本并在每步失败时落盘日志（当前为手工分步执行，日志见 `.step12-test/` 与本报告）。

## 9. 尚未解决的问题 / 已知限制

1. **地址时效**：pinggy 免费隧道 60 分钟过期，域名不可控；手机体验需在有效期内进行，过期后需重建隧道（命令已记录，可复用）。
2. **带宽**：免费隧道限速，图片/视频多的页面首次加载较慢（gzip 后 JS 66KB≈5s）；建议手机端耐心等待首次加载。
3. **pinggy 警告页**：每个新访客首次访问需点一次 Continue（一次性 cookie）。
4. **Vercel 匿名部署不可用作正式预览**：`tmp.now` 匿名部署 60 分钟过期，且 Vercel WAF 拦截本机浏览器指纹（curl 通、Edge 403）；要稳定地址需 `vercel login` 后部署到账号下 Preview 环境。
5. localhost.run 免费层域名轮换 + 严重限速，不适合本项目负载。

## 10. 需要本人完成的操作

- **手机访问**：用手机浏览器打开 `https://sheyh-36-28-220-14.run.pinggy-free.link`，首次出现 pinggy 警告页时点 Continue，然后正常使用（60 分钟内有效）。
- **如需长期/稳定地址**：执行 `npx vercel login` 登录后告知我，可改为部署到账号下的 Preview 环境（不覆盖 Production）；或注册 pinggy 获取不轮换域名。
- 若隧道到期：告诉我"重建隧道"，我会重启静态服务检查并重新建立隧道、更新地址。

## 11. 安全边界确认

未调用真实 DeepSeek API；未读取/复制/上传任何 API Key；未修改 `api/`、`server/`、`index.js`、API 配置、密钥；未 push、未部署 Production；未删除任何已有文件或未提交修改。
