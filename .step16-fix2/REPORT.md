# 1201｜第三轮修复报告：字体闪变与收藏夹图片加载

日期：2026-11-15
范围：仅字体加载与收藏夹图片加载。未改 `api/`、`server/`、`index.js`，未接真实 API，未 push/部署，未改首页/信封信纸已通过功能。

---

## 1. 问题 01：留言页字体闪变 — 真实原因与修复

### 测量到的真实原因
- 信纸 `.letter-text` 使用 `'Ma Shan Zheng'`，唯一来源是 `index.html` 的 Google Fonts `css2` 外链。
- Google Fonts 按 unicode-range 拆分为 **92 个 woff2 分包**；信纸打开瞬间浏览器**并发请求 18 个分包，合计约 1.3MB**（实测 netlog：单包 13KB–92KB）。
- 字体请求只在信纸首次渲染时才触发 → 手机上 2–3 秒内先用 PingFang 回退字体，字体到达后整体闪变。
- 测量数据（修复前，本地）：信纸 19.97s 出现，18 个 gstatic 请求在 ~0.7s 内到达（本地带宽快所以无感）；公网/蜂窝下同样 1.3MB 需数秒 → 即用户反馈的闪变。

### 修复方案：**本地托管字体子集 + 预加载**（未用未授权字体，Ma Shan Zheng 为 OFL）
1. 从 `Message.jsx` 提取信纸实际用字 **212 个唯一字符**；
2. 用 Google Fonts `css2?family=Ma+Shan+Zheng&text=<chars>` 接口生成**仅含这些字形的单个 woff2 子集：42,296 字节**（原 18 包 ~1.3MB → **-97%**）；
3. 保存为 `public/fonts/mashan-zhen-subset.woff2`；
4. `message.css` 顶部新增 `@font-face`（`font-display: swap`，unicode-range 与子集一致）；
5. `index.html`：**删除 Google Fonts 外链**（信纸是唯一使用方），新增 `<link rel="preload" as="font" crossorigin>` 预加载该 woff2——页面加载早期即下载，信纸打开时必然命中缓存。

### 修复后实测（公网隧道，冷缓存）
- woff2 资源 timing：`start=1454ms`（页面加载即开始）、`end=5459ms`、transferSize=42,596B；
- 信纸出现时 `performance.now()=22424ms` → **字体在信纸打开前 ~17 秒已就绪**；
- `document.fonts.check('16px "Ma Shan Zheng"')=true`；`fontFamily` 计算值正确；
- 字体相关网络请求：**1 条同源请求，0 条 fonts.googleapis/gstatic 外联**。
- 结论：**字体闪变消除**（字体先于内容就绪，swap 回退不可见）。

## 2. 问题 02：收藏夹图片加载 — 测量与修复

### 第一阶段：测量（修复前，本地冷缓存）
- 首进 Collection 立即发出 3 张窗口图请求（±1 策略生效：photo9/2/1），本地图全部 **244ms 完成**——本地传输不是瓶颈。
- 但请求体积：窗口 3 图 jpg 共 **404KB**（photo9.jpg 233KB、photo1.jpg 94KB、photo2.jpg 77KB）+ Q版预加载 **4 张共 ~340KB** + live mp4 286KB + 背景 webp。
- 未发现重复请求、IntersectionObserver 阻塞或串行加载；瓶颈是**字节数 × 隧道带宽**。

### 第二阶段：公网隧道实测（修复前代码已被覆盖，无法回测；按字节量客观对比）
- 修复后隧道实测：3 张窗口图 complete 耗时 **4.7s / 5.8s / 8.5s**（photo1.webp 最慢，与 286KB mp4 竞争带宽）。
- 隧道有效带宽约 **60–80KB/s**——这是剩余慢的主因，属传输层而非前端逻辑。

### 第三阶段：修复（减字节，不动加载策略）
| 项 | 前 | 后 |
|---|---|---|
| 窗口 3 图 | jpg 404KB | **webp 191KB**（photo1 58K、photo2 45K、photo9 88K，quality 82，原 jpg 保留） |
| Q版预加载 | 4 张 ~340KB 挂载时全拉 | **仅当前+下一张 ~170KB**，随 `currentIndex` 更新 |
| 收藏夹背景 | webp 55KB（上轮已改） | 不变 |
| 其余 6 张照片 | 未加载（±1 策略不变） | 未加载，webp 备用 |

- `Collection.jsx`：9 处 `photo:` 路径 `.jpg`→`.webp`（video.poster 自动用同一 webp）；chibi 预加载 effect 改为 current+next。
- 未压缩 mp4（无 ffmpeg）；未动滑动/评论/Live Photo/清理逻辑；未全量预加载。

### 修复后实测
- **本地冷缓存**：3 图 complete 仍 **226ms**（localhost 无瓶颈）。
- **公网隧道冷缓存**：首卡链路 photo2.webp 4.7s、photo9.webp 5.8s、photo1.webp+video 8.5s——字节减半但隧道带宽是硬约束。
- **回归（公网 15/15 PASS）**：按需加载 3/9、Live Photo 公网播放、信封信纸、Chat mock、无独立标点、气泡尾巴、Range 206、无真实 API。

## 3. 修改文件

| 文件 | 修改 |
|---|---|
| `index.html` | 删 Google Fonts 外链；加 woff2 preload |
| `src/styles/message.css` | 新增本地 `@font-face`（42KB 子集） |
| `public/fonts/mashan-zhen-subset.woff2` | 新增（OFL 字体子集） |
| `src/pages/Collection.jsx` | photo 路径→webp；chibi 预载改 current+next |
| `public/photos/**/*.webp` ×9 | 新增（原 jpg 保留） |

未修改：`api/`、`server/`、`index.js`、Home/Message/Chat 业务逻辑、mock 隔离、原始 jpg/mp4/mov/mp3。

## 4. 构建与回归

- `npm run build` ✅ `index-CDlaX626.js` 188.70 kB；`vite.mock.config.js` 构建 ✅。
- 公网隧道回归 `retest2-check.mjs`：**15/15 PASS**（`retest2-results.json`）。
- Live Photo 专项：公网播放 PASS（retest 覆盖）；Range 206 PASS。

## 5. 本地 vs 公网性能差异（如实报告）

| 指标 | 本地 :4174 | 公网 pinggy 隧道 |
|---|---|---|
| Collection 3 图 complete | 226ms | 4.7–8.5s |
| 信纸字体 | 即时 | 预加载后 0 等待 |
| 首屏 JS+HTML | <1s | ~10s（66KB gz + 隧道 RTT） |

**结论：修复后前端传输量已最小化；公网剩余慢主要是 pinggy 免费隧道带宽（~60-80KB/s）与延迟，非代码问题。** 真机若仍嫌慢，根本解法是换稳定托管（Vercel 账号部署/对象存储 CDN），隧道仅适合验收。

## 6. 未解决问题与已知风险

1. **字体子集锁定**：子集仅含当前信纸 212 字；若日后修改信纸文案出现新字，该字回退系统字体（需重新生成子集，命令已记录于本报告流程）。
2. **mp4 未压缩**（286–637KB/个）：无 ffmpeg；Live Photo 首进仍会下载当前 live 视频。可接受范围，真机若卡再议转码。
3. **隧道带宽**：免费隧道 ~60-80KB/s 为物理上限，图片多的页面首进仍需数秒；建议正式体验用稳定部署。
4. photo5.webp 214KB、photo8.webp 183KB 相对大（复杂照片），quality 82 已平衡；未继续盲压。

## 7. 截图/断言

`measure` 数据：`.step16-fix2/netlog-{local,local2,tunnel}.json`、`font-check` 输出、`retest2-results.json`（15/15）。
