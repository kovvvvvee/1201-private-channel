# Step 16 fix3 — 图片加载与字体完整性专项修复报告

日期：本轮会话。范围：仅修复用户反馈的四项问题（Collection 首进/Live Photo、Message 开屏壁纸、信纸字体混排、Chat 背景）。未进入 Step 15，未改 `api/`、`server/`、根 `index.js`，未接真实 API，未 push，未删原始资源。

## 一、四项问题根因

### P1 收藏夹首进加载 + Live Photo 不动
- 静态图：±1 按需加载本身正确，但**加载顺序是 `-1,0,+1`**（循环偏移顺序），当前可视卡并不一定最先请求；且当前卡图片没有 `fetchpriority` 提示，公网带宽受限时可能排在相邻卡之后。
- Live Photo：视频元素只有 `video.muted`/`video.playsInline` **属性**，缺少对应 HTML attribute（部分移动浏览器对 autoplay 策略检查 attribute）；`play()` 仅在挂载与 `canplay` 时各试一次，若 `canplay` 早于 `play()` 的 Promise 拒绝处理窗口或数据未就绪则永久静音；无用户手势兜底。

### P2 Message 开屏壁纸变慢
- 壁纸仍是 `message-bg.jpg`（**284 KB**），CSS `background` 在 `.message-page` 挂载后才发起请求；index.html 中虽有 preload 但指向旧 jpg 路径。

### P3 信纸字体混排（重点）
- fix2 的 `text=` 子集**只覆盖了抽样字符**，实际信纸共 **207 个不重复字符**，子集缺 `U+FF1F`（？）、`U+2026`（…）等标点 → 这些字符回退系统字体，产生"部分文字默认字体"的混排。
- 修复前验证方式错误：仅看 `fonts.check()` 不足以证明逐字覆盖。

### P4 特别通讯背景慢
- `chat-bg.jpg` **107 KB**，无 preload，CSS 背景延迟请求。

## 二、修改文件与内容

| 文件 | 修改 |
|---|---|
| `src/pages/Collection.jsx` | `loadWindowMedia` 改为**当前卡优先**（order=[0,+1,-1]），当前卡图加 `fetchpriority="high"`；视频补 `muted`/`playsinline` HTML attribute；`canplay`+`loadeddata` 双事件补播；新增 `touchstart` 手势兜底 `play()`；清理逻辑同步移除手势监听 |
| `src/styles/message.css` | `message-bg.jpg` → `message-bg.webp` |
| `src/styles/chat.css` | `chat-bg.jpg` → `chat-bg.webp` |
| `src/pages/Message.jsx` | JS preload 路径 `message-bg.jpg` → `.webp` |
| `index.html` | preload 更新为 `message-bg.webp`；**新增** `chat-bg.webp` preload |
| `public/fonts/mashan-zhen-subset.woff2` | 重新生成：unicode-range 覆盖信纸全部 207 字符（含全角标点 ！？：；（）。，、…等），84,648 B（原 42 KB 子集缺字，按要求优先完整性） |

资源转换（原图全部保留）：
- `public/letter/message-bg.webp`：25546 B（jpg 290348 B，**-91%**）
- `public/chat/chat-bg.webp`：71850 B（jpg 109481 B，**-34%**）

## 三、字体完整性验证（逐字，非 fonts.check 表面值）

脚本提取 `.letter-text` 全部文本 → 去重 → 逐字符 `document.fonts.check('16px "Ma Shan Zheng"', ch)`：

- **总字符数：207，缺失 glyph：0**（本地冷缓存、公网冷缓存两次运行结果一致：`{"total":207,"missing":[]}`）
- 渲染抽查：`letter-text p` computed `font-family` 均为 `"Ma Shan Zheng"`，无回退混排
- 字体为本地 woff2 + `index.html` preload，信纸打开前字体已就绪（公网实测信纸 22s 才打开，字体在页面加载 1.4s 即完成下载）

## 四、测试记录

### 本地（static-server :4174，dist-mock，冷缓存 Network.setCacheDisabled）— 10/10 PASS

- Collection 首进：`photo1.webp`(当前卡,fetchpriority=high)、`photo2.webp`、`photo9.webp` 均在 **232ms** 内 `complete && naturalWidth>0`
- Live Photo：自动播放 `paused=false, readyState>=3`；离开→重进恢复播放
- 壁纸：`message-bg.webp` 25846 B 单次请求（probe 证实 preload 于导航后 **14–15ms** 触发，无重复请求；另证实 `chat-bg.webp` 同时预载）
- 字体：207/207 字符有 glyph
- chat 背景：`chat-bg.webp` 72150 B 已加载
- 热缓存 reload：首页人物图即时可用
- 真实 API 外联：0 条

### 公网临时环境（pinggy 隧道，冷缓存）— 10/10 PASS

- Collection 首进图片完成时间：photo9 **4.2s** / photo2 **5.3s** / photo1(Live) **6.1s**（隧道带宽下；对比 fix2 前同项需数倍时间）
- Live Photo 公网自动播放 ✅，重进恢复 ✅，当前卡 `fetchpriority=high` ✅
- 壁纸 `message-bg.webp` 25846 B，responseEnd-startTime ≈ **3.4s**（含隧道 RTT）
- 字体 207/207 ✅；chat-bg.webp 72150 B ✅
- 热缓存 reload ✅；0 条真实 API 外联 ✅
- 公网地址：`https://fwqgm-36-28-220-14.run.pinggy-free.link`（pinggy 免费隧道，**约 60 分钟有效**，已验证服务的是 fix3 新构建 hash `index-DQeBDEOW.js`）

## 五、加载策略变化汇总

| 资源 | 前 | 后 |
|---|---|---|
| message-bg | jpg 284KB，CSS 延迟请求 | webp 25KB，index.html preload + Message.jsx preload（同 URL 去重，实测单请求） |
| chat-bg | jpg 107KB，CSS 延迟请求 | webp 72KB，index.html preload |
| 字体 | 42KB 子集缺字 | 83KB 子集全覆盖 207 字符 |
| Collection 当前卡 | 与相邻卡同优先级 | `fetchpriority=high` + 最先请求 |
| Live Photo | 属性级 muted/playsInline，单次 play | attribute 级 + canplay/loadeddata/手势三重播放触发 |

## 六、未解决问题与风险

1. **隧道带宽天花板**：公网 Collection 图片 4–6s 主要是 pinggy 免费隧道吞吐限制（本地同项 232ms），非代码问题；正式体验需稳定托管。
2. **字体子集维护成本**：子集锁定当前 207 字符；**信纸文案改动必须重新生成子集**，否则新字会回退。
3. **Live Photo mp4 未重压**（无 ffmpeg）；公网首进 video 与图片共享带宽，极端慢网下视频可能略滞后于静态 poster（poster=webp 静态图先显示，视频随后接管，视觉上无空白）。
4. 真机 iOS Safari 未实测（仅 Edge CDP 模拟）；playsinline/muted attribute 与手势兜底已按 Safari autoplay 策略补齐，建议手机复测确认。
5. verify.mjs 单次运行中曾观测到 message-bg resource timing `startTime` 异常值（疑似 SPA 内 performance 条目累计口径），但 probe 两次独立验证确认**仅 1 次请求、preload 于 14ms 触发**，判定为测量口径问题而非重复下载。

## 七、结论

四项问题均已修复并有可复现证据：本地 10/10、公网 10/10 PASS；字体逐字审计 207/207 无缺失；资源体积 message-bg -91%、chat-bg -34%、字体以 +41KB 换取完整覆盖。按要求**暂停等待审查**，未宣布最终验收。
