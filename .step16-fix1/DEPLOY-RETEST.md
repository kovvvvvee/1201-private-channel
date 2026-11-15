# 1201｜第二轮复测：隔离体验版重新部署报告

日期：2026-11-15 16:43（构建时间）
性质：移动端体验测试，Mock 聊天，未接真实 DeepSeek API。

---

## 1. 启动前检查

- `.step16-fix1/REPORT.md` 存在，Step16 第一批修复已验收（27/27 + 6/6）。
- Git 工作区：24 项未提交改动全部保留（Step03–16 累计），未回滚、未覆盖。
- `vite.mock.config.js` Mock 注入仍在 `dist-mock/index.html`（`__MOCK_CHAT_INSTALLED__`）。
- 无遗留静态服务器/隧道进程（4174 等端口构建前确认空闲）。

## 2. 构建

| 项 | 值 |
|---|---|
| 构建时间 | 2026-11-15 16:43:59 |
| Git HEAD | `323073b`（工作区含 Step16 未提交修改） |
| 正式构建 | `npm run build` → `dist/`，57 modules，`index-DRphFcmn.js` 188.63 kB（gzip 66.21 kB） |
| 体验版构建 | `npx vite build --config vite.mock.config.js` → `dist-mock/`（全新生成，非旧目录） |
| 敏感信息扫描 | `dist-mock` JS 产物无 `deepseek`/`sk-`/`Bearer`/API Key；`/api/chat` 由内联 mock 脚本拦截 |

## 3. 静态服务器

- 命令：`node .step12-test/static-server.mjs`
- 地址：`http://localhost:4174` → `dist-mock/`
- 特性：SPA fallback、gzip、**HTTP Range（206）**、不校验 Host
- 本地验证：`/` → 200；`Range: bytes=0-99` mp4 → `206` + `Content-Range: bytes 0-99/293375`

## 4. 公网隧道

- 工具：**pinggy.io SSH 隧道**（与上轮相同，已验证可用）
- 命令：`ssh -p 443 -R0:localhost:4174 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 a.pinggy.io`
- 分配远程端口：6；隧道进程运行中（shell `cad703`）

### 新公网地址（本次新建，已实测）

- **主：`https://gfbid-36-28-220-14.run.pinggy-free.link`**
- 备：`https://yeagh-36-28-220-14.free.pinggy.net`

首次访问会出现 **pinggy Caution 警告页**，点击 **Continue/继续访问** 按钮一次即可（之后 cookie 记住）。

## 5. 公网部署后验证（真实 Edge + CDP，穿透隧道）

`deploy-retest-check.mjs` → **15/15 PASS**（`retest-results.json`）：

| 验证项 | 结果 |
|---|---|
| 公网 Launch → 首页进入、人物图加载（P01 修复生效） | PASS |
| Collection 首进按需加载（3/9 张有 src）+ 首卡图加载 | PASS |
| **Live Photo 公网实际播放**（video playing, readyState≥3） | PASS |
| Message 信封 webp 加载 + 信纸底色兜底 `rgb(243,234,217)` | PASS |
| Chat mock 回复逐条到达 | PASS |
| 无独立标点消息（P04 修复生效） | PASS |
| Mock「失败」→ 错误提示 | PASS |
| AI 气泡尾巴存在（P05 修复生效） | PASS |
| **公网 Range 请求 206**（`bytes 0-1023/293375`） | PASS |
| 刷新回到 Launch | PASS |
| 无真实 API / 无 `/api/` 网络请求 / 无 deepseek 外联 | PASS |

截图：`.step16-fix1/shots/retest-{home,collection,letter,chat}.png`

## 6. Mock 隔离与 API 安全

- `fetch('/api/chat')` 被 `dist-mock/index.html` 内联脚本拦截，返回本地 SSE；消息含「失败」→ HTTP 500。
- Network 抓包：0 条 `/api/` 真实请求、0 条 deepseek/openai 外联。
- 正式 `dist/` 未注入 mock，仍走 `/api/chat` 代理（隔离边界保持）。

## 7. 有效期与运行状态

- **pinggy 免费隧道：60 分钟**（约至 17:45），过期后地址失效，需重建（命令已记录）。
- 静态服务器 `:4174` 与 ssh 隧道进程在验证期间持续运行，验证后仍保持（供手机复测）；如需停止告知即可。

## 8. 需要本人完成的操作

1. **立即**用手机浏览器打开 `https://gfbid-36-28-220-14.run.pinggy-free.link`（60 分钟内有效）。
2. 首次出现 pinggy Caution 页时点 **Continue**。
3. 重点复测：Collection 首进图片 + **Live Photo 真机播放**（Safari 解码器兼容性仅真机可确认）、留言信封/信纸亮度、特别通讯多轮对话（含独立句号/气泡尖角）。
4. 如隧道到期或需新地址，告诉我"重建隧道"即可。

## 9. 安全边界确认

未修改业务代码；未改 `api/`、`server/`、`index.js`；未接真实 DeepSeek；未暴露 API Key；未 push、未部署 Production；未覆盖原测试报告；未删除资源或未提交修改。

## ׷�ǣ��������޸������²���17:35��
- �µ�ַ��`https://fwqgm-36-28-220-14.run.pinggy-free.link`���� `xeuyh-36-28-220-14.free.pinggy.net`����60 ������Ч
- ������17:35 ���� build������ `index-CDlaX626.js`���������Ӽ�+webp�޸���
- ������֤��15/15 PASS��`.step16-fix2/retest3-results.json`��
