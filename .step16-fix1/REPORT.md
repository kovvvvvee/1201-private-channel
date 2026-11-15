# 1201｜移动端真实体验问题修复报告（第一批）

日期：2026-11-15
范围：仅修复用户反馈的 5 项移动端体验问题。未改 `api/`、`server/`、根目录 `index.js`，未接真实 API，未 push/部署。

---

## 1. 各问题真实根因

### 问题 01：首页人物照片延迟约 3 秒后整体出现
- **根因**：`xinghui-home.webp` 原为 222KB 未压缩转换产物；虽然 `index.html` 已有 preload，但文件体积大 + `fetchpriority="auto"`，在慢速隧道/移动网络下首屏仍需数秒下载，表现为"空白→突然出现"。
- **修复**：用 sharp 重编码 webp（1080×1920 尺寸不变，quality 80），222KB → **150KB（-32%）**；index.html 预加载声明维持不变。

### 问题 02：收藏夹首次进入资源异常 + Live Photo 无法播放
- **根因 A（首次加载）**：卡片初始化时给全部 9 张照片 img 直接赋 `src`，移动端一次性并发请求 ~1.5MB JPG + 535KB PNG 背景，首屏排队严重；且 `collection.css` 背景仍引用 `home-bg.png`（535KB），未用已存在的 webp（55KB）。
- **根因 B（Live Photo）**：① `static-server.mjs` 不支持 HTTP Range，iOS Safari 播放 mp4 强制要求分段请求 → 真机必然失败；② `play()` 只在 500ms 定时器和切换时调用一次，视频未就绪时 reject 后无重试；③ 残留调试代码 `addDebugLog` 未定义，一旦 play 失败走 catch 会抛 ReferenceError。
- **修复**：
  - `collection.css` 背景 PNG→WebP；
  - `Collection.jsx` 卡片图片改为**按需赋 src**（`data-src` 暂存，仅当前卡 ±1 加载，`loadWindowMedia()` 在初始化和 `goTo` 时调用），首次进入只拉 3 张图；
  - `video` 增加 `canplay` 事件：若仍是当前卡则补 `play()`；
  - 删除两处 `addDebugLog` 调用；
  - `static-server.mjs` 实现完整 Range 支持（206 / Content-Range / Accept-Ranges / Content-Length，含 suffix range）。

### 问题 03：留言信封缺失 + 信纸异常变暗
- **根因**：信封/信纸已转 webp 但 `index.html` 仍预加载 `letter.png`（旧路径，白占带宽）；`letter.webp` 无任何兜底——webp 请求失败时 `.letter-wrapper` 透明，露出 `.letter-container` 的 `rgba(0,0,0,0.85)` 黑遮罩 → 整页变暗；信封 img 无失败回退。
- **修复**：
  - `index.html`：`letter.png` preload 改为 `letter.webp`，新增 `envelope.webp` 预加载；
  - `Message.jsx`：挂载时预加载 envelope/letter；信封 `onError` 回退 `/letter/envelope.png`；
  - `message.css`：`.letter-wrapper` 增加 `background-color: #f3ead9` 纸色兜底（webp 失败时仍是浅色信纸而非黑屏）。遮罩层本身未删，动画保留。

### 问题 04：特别通讯出现独立句号
- **根因**：`splitIntoSentences` 第 2 级按 `\n+` 分割时，若 AI 回复末尾标点单独成行（如 `…\n。`），会产生纯标点片段 `"。"` 作为独立消息发送；mock 脚本 `split('。')+追加'。'` 还会把 `？` 结尾句子变成 `？。` 双标点，进一步加剧。
- **修复**：
  - `Chat.jsx` 去重循环增加过滤：`/[\p{L}\p{N}]/u.test(trimmed)`——只含标点/符号的片段不再作为消息（正常句中标点不受影响）；
  - `vite.mock.config.js`：改为按 `[。！？…]` 带标点切分（`match(/[^。！？…]+[。！？…]?/g)`），不再产生双标点。

### 问题 05：特别通讯头像慢 + 气泡尖角朝下不对齐
- **根因**：头像 webp（各 6KB）无预加载，进入聊天页才首次请求；气泡只有 `border-*-radius:4px` 小圆角，没有真正的尾巴伪元素，视觉上"尖角朝下"且不指向头像。
- **修复**：
  - `index.html` 新增两个头像 webp preload；`ChatBubble.jsx` img 加 `decoding="async"`；
  - `chatBubble.css` 新增尾巴：AI 气泡 `::before`（描边色）+`::::after`（填充色）双层三角形向左指向头像；用户气泡 `::before` 向右指向头像；375px 以下微调 top 对齐 30px 头像。

### 附带修复（测试暴露）
- `character.css` 对话气泡 `white-space:nowrap` + `max-width:none` 在 320px 下长文本溢出 → 改 `max-width:72vw; white-space:normal`（修复移动端横向溢出）。
- `Collection.jsx` 重写中残留的未定义 `addDebugLog`（潜在 ReferenceError）。

## 2. 修改文件清单

| 文件 | 修改 |
|---|---|
| `src/pages/Collection.jsx` | 图片按需加载、canplay 补播、删 addDebugLog |
| `src/styles/collection.css` | 背景 PNG→WebP |
| `src/pages/Chat.jsx` | 纯标点句过滤（1 处条件） |
| `src/styles/chatBubble.css` | AI/用户气泡尾巴 + 窄屏适配 |
| `src/components/ChatBubble.jsx` | `decoding="async"` |
| `src/pages/Message.jsx` | 预加载信封/信纸、信封 onError 回退 PNG |
| `src/styles/message.css` | 信纸底色兜底 |
| `src/styles/character.css` | 对话气泡换行防溢出 |
| `index.html` | preload 修正（letter.webp、envelope.webp、头像×2） |
| `public/character/xinghui-home.webp` | 重编码 222KB→150KB（尺寸不变） |
| `vite.mock.config.js` | mock 回复切分保留原标点 |
| `.step12-test/static-server.mjs` | HTTP Range 支持（部署链路文件） |
| `.step16-fix1/verify*.mjs` | 验证脚本（测试产物） |

**未修改**：`api/`、`server/`、`index.js`、`src/pages/Home.jsx`、`Chat.jsx` 其余逻辑、密钥、任何图片/视频/音频原始资源（webp 为新增衍生文件，png/jpg/mp4/mov/mp3 均保留）。

## 3. 构建结果

- `npm run build`（正式 dist）：✅ 57 modules，`index-DRphFcmn.js` 188.63 kB / gzip 66.21 kB。
- `npx vite build --config vite.mock.config.js`（dist-mock 体验版）：✅ 同上 + mock 注入。

## 4. 实际浏览器测试结果（Edge headless + CDP，dist-mock @ :4174）

**verify.mjs：27/27 PASS**（`results.json`）
**verify-live-reentry.mjs：6/6 PASS**（`live-results.json`）

| 问题 | 关键证据 |
|---|---|
| P01 | 冷缓存（禁 HTTP cache）下，从导航到 `.character` complete+naturalWidth=1080 即就绪；preload 使启动动画期间已下载完 |
| P02 | 冷缓存首进：9 张图中仅 3 张赋 src（当前±1），首卡/Q版图均 complete；Live Photo `paused=false, readyState=4, currentTime 0.16→1.67` 持续前进；滑走再滑回视频恢复；热缓存二次进入 3/3 loaded |
| P03 | 信封 webp `complete && naturalWidth>0`；信纸 `backgroundColor=rgb(243,234,217)` + `letter.webp` 背景图存在 |
| P04 | 3 轮消息（正常/失败/正常）共 9 条 AI 气泡，**0 条纯标点**、0 条双标点；500 错误提示正常 |
| P05 | 头像 webp 全部 complete（nw=144）；AI 气泡 `::before/::after` 尾巴存在、气泡左缘与头像右缘 gap=10px；用户气泡右尾巴存在 |
| 移动端 | 320/375/430px home+chat `scrollWidth` 溢出均 =0px |
| 网络安全 | 0 条 deepseek/openai/api 请求；外联仅 Google Fonts |

## 5. Live Photo 验证环境与限制

- 测试环境：Edge headless（Chromium）+ CDP + 本地静态服务器（已加 Range）。
- **已验证**：首个视频自动播放、currentTime 前进、切换暂停/恢复、离开清理、重进恢复、3 次连续进出仅 1 个 video 元素、无 play 报错。
- **Range 验证**：`curl -H "Range: bytes=0-1023"` → `206 Partial Content`，`Content-Range: bytes 0-1023/293375`，`Accept-Ranges: bytes`，`Content-Length: 1024` ✅。
- **canplay 手势问题**：`video.muted=true` + `playsInline` 的 autoplay 在移动端无需用户手势（Chrome/Safari 均允许静音自动播放）；用户首次进入 Collection 的滑动手势也会触发播放。
- **限制（NOT TESTED）**：真机 iOS Safari / Android Chrome 未实测。Range 已按规范实现，但 Safari 对 mp4 编解码器（H.264 vs HEVC）兼容性需真机确认。建议手机端重点复测 Live Photo。

## 6. 冷/热缓存区分

- **冷缓存**：`Network.setCacheDisabled(true)` + 全新浏览器 profile，P01/P02/P03 均在此条件下通过。
- **热缓存**：同 profile 第二个页面（cache enabled），二次进入 Collection 图片全部就绪。
- 结论：首次进入不再依赖"反复进入"，按需加载窗口保证首屏只拉必要资源。

## 7. 未解决问题与已知风险

1. **真机 Live Photo**：Chromium 通过，Safari 解码器兼容性待真机确认（mp4 为 H.264 基线，大概率兼容）。
2. **P01 残余等待**：150KB webp + 慢隧道仍需 ~1-2s；启动动画 ~9s 已覆盖绝大部分下载时间，实测进入 Home 时已 complete。
3. **信封回退**：webp 失败回退 png（676KB）在极慢网络下仍可能延迟，但功能可用。
4. mock 聊天仅存在于 `dist-mock` 构建，正式 `dist/` 仍走 `/api/chat` 代理——符合隔离边界。
5. `.step12-test/static-server.mjs` 为本地验证服务器，非生产部署组件。

## 8. 需要本人操作

- 用手机打开体验版地址（如隧道仍有效）复测：**Collection 首进 + Live Photo**、**留言信封/信纸**、**特别通讯多轮对话**。
- 若 Live Photo 在真机仍无法播放，请反馈具体机型与现象（黑屏/仅封面/报错）。

## 9. 截图证据（`.step16-fix1/shots/`）

`p01-home-char` `p01-home-dialogue` `p02-collection-live` `p02-collection-hot` `p03-envelope` `p03-letter` `p05-chat-tail` `live-first-play` `live-reentry`

原始断言：`results.json`（27/27）、`live-results.json`（6/6）。
