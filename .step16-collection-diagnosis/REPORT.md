# Step 16 Collection 专项诊断报告

基线：HEAD `6d34954`（稳定标签 `step16-fix3-stable` → `cafc321`），工作区干净，未修改任何代码，未 push，未部署。

诊断脚本：`.step16-collection-diagnosis/diag.mjs`，真实浏览器（Edge CDP，390×844，触摸模拟）。原始数据：`snap-*.json` / `res-*.json`。

## 一、P1 收藏夹照片首进不加载 — 诊断结论

### 四阶段分解（本地冷缓存 / 本地热缓存 / Vercel 冷缓存 / Vercel 热缓存，全部实测）

| 阶段 | 实测结果 |
|---|---|
| A. 请求是否及时发起 | **是**。进入 Collection 后 41–66ms `.photo-container` 挂载，`loadWindowMedia(0)` 同步执行，当前卡+相邻两卡共 3 张图 + 2 张 Q 版在挂载后 ~2ms 内全部发出请求（resource timing `startTime` 集中在挂载点）。无 IntersectionObserver、无懒加载条件阻塞。 |
| B. 下载是否缓慢 | 本地：3 张图 5–8ms 完成。Vercel（经本机代理）：约 0.6–1.0s 完成，HTTP 200，`server: Vercel`。**但响应头为 `cache-control: public, max-age=0, must-revalidate`** —— public/ 下非指纹资源每次访问都必须回源校验。 |
| C. 解码/显示是否延迟 | `img.decode()` 实测 6.5–17.3ms；snap 采样显示进入后 **~1.1s 内 3/3 张图 `complete && naturalWidth>0`**，卡片 `opacity=1`、`zIndex` 正确，无 CSS 隐藏。 |
| D. 绑定/索引是否错乱 | DOM 中 `img.src` 与 `dataset.src` 一致；切换、重进均正确；无重复请求（每资源仅 1 条 resource entry）。 |

### 真实根因判定

**代码路径无故障，问题在用户设备到 Vercel CDN 的网络可达性。**

证据链：
1. 四个环境下请求发起、下载、解码、显示全部正常（上表），不存在"请求没发""解码卡死""被 CSS 隐藏"任何一类代码问题。
2. 用户症状"第一次进不来、第二三次才出现"是典型的**弱网首访失败→浏览器缓存/重试逐步命中**模式：Vercel 静态资源带 `must-revalidate`，首次访问需完整 TLS+下载；若用户手机网络对 `*.vercel.app` 不稳定（国内直连常见高延迟/断流），首批并发请求（3 图+2 Q版+293KB mp4+字体）会长时间挂起直至超时，浏览器放弃；第二、三次进入时部分资源已落盘缓存或 keep-alive 连接已建立，逐步显示。
3. 本机测试经系统代理访问 Vercel（约 1s 完成），**不能代表用户手机直连**；用户手机大概率无代理。
4. 已排除：懒加载逻辑（无 IO）、重复请求（无）、解码瓶颈（<20ms）、React 状态不同步（DOM 直读 complete）、格式错误（webp/jpeg 均 200）、Range（mp4 返回 206）。

### 次要因素

- 首屏并发：进入瞬间 3 图 + 2 Q版 + video + 字体同时争抢，弱网下相互拖累。
- `must-revalidate` 使每次进收藏夹都重新校验，弱网下每张图都多一次 RTT。

## 二、P2 Live Photo 静态不动 — 诊断结论

### 实测状态（四环境一致）

| 检查项 | 结果 |
|---|---|
| 静态照片 | 正常显示（poster 与 `<img>` 均加载） |
| 视频请求 | 发起，HTTP 206（Range），293,675 B |
| readyState / networkState | `rs=4 / ns=1`（HAVE_ENOUGH_DATA / IDLE） |
| paused / currentTime | `paused=false`，ct 持续前进（0→2.0s 循环） |
| play() Promise | 手动 `await v.play()` → `{ok:true, ms:0}`，无拒绝 |
| DOM 属性 | `muted=true, defaultMuted=true, muted属性✓, playsinline属性✓, playsInline=true` |
| 触摸兜底 | touchstart 后视频保持播放 |
| 切换/重进 | swipe 到静态卡 → video 元素清除（0 个）；重进 → 新 video rs=4 播放中，无泄漏 |
| 控制台/异常 | 0 条 error / exception |

### 真实根因判定

**测试环境（Chromium）中 Live Photo 完全正常，"静态不动"是环境差异，最可能为以下之一（按概率排序）：**

1. **网络原因（与 P1 同源）**：mp4 293KB 在弱网下无法及时下载 → `canplay` 不触发 → `play()` 一直 pending → 用户看到的是 poster 静态帧（视觉上就是"静态照片"）。视频请求发起后若中途断流，`readyState` 停在 <3。
2. **iOS Safari 自动播放限制**：若用户开启**低电量模式**，iOS 会禁止一切自动播放，`play()` 被拒；代码中 `.catch(()=>{})` **静默吞掉拒绝原因**，无日志可查。我们的 touchstart 兜底需要用户**触摸照片区域**才生效——若用户只看不碰，视频保持静止。
3. 用户手势时效：进入页面的点击手势激活窗口很短，+500ms 定时器里的 `play()` 可能已超出 transient activation；muted 通常豁免，但部分 iOS 版本仍要求手势。

**已排除**：视频格式（H.264 mp4，Chromium 正常；iOS Safari 原生支持）、Range 请求（Vercel 返回 206）、属性缺失（muted/playsinline 均在真实 DOM 生效）、资源泄漏（进出无重复 video）、代码逻辑错误（四环境播放证据一致）。

## 三、测试数据汇总

### 本地（static-server :4174，dist-mock）
- 冷/热缓存结果一致：3 图 ~7ms 完成、decode ~10ms、video rs=4 播放、0 错误。
- 注意：本地服务器不返回 cache-control 头（`cc:null`），与 Vercel 行为不同。

### Vercel 生产（通过本机系统代理的真实浏览器）
- 冷缓存：图片请求于进入后立即发出，~1.0s 完成；video 206 完成；t1.1s 时 3/3 图 complete；video 持续播放。
- 热缓存：同上，耗时相近（must-revalidate 仍回源校验，但 edge `age` 命中）。
- **重要声明**：本机到 Vercel 走代理，延迟 ~1s；用户手机直连延迟未知且大概率更差，上述"正常"不能外推到用户设备。

## 四、已排除的可能原因（逐项）

| 假设 | 排除证据 |
|---|---|
| 懒加载/IO 未触发 | 无 IO；src 在挂载后 2ms 内赋值 |
| 请求未发起 | resource timing 显示全部发起 |
| 重复/取消请求 | 每资源仅 1 条记录 |
| 解码瓶颈 | decode() 6.5–17.3ms |
| CSS/透明度隐藏 | opacity 实测 =1 |
| React 状态不同步 | DOM 直读 complete/naturalWidth |
| 视频格式不支持 | Chromium 正常播放；H.264+iOS 兼容 |
| Range 不支持 | Vercel mp4 返回 206 |
| autoplay 属性缺失 | muted/playsinline 属性+property 均确认 |

## 五、建议的最小修改方案（待审查，未实施）

### P1（按优先级）
1. **根本解（部署层，非代码）**：将 `public/` 静态资源迁移至国内可达 CDN/对象存储，或给 Vercel 配自定义域名+国内优化线路。这是唯一能解决"用户手机打不开 vercel.app"的方案，代码无能为力。
2. **次优（代码，需用户批准）**：为 `public/photos`、`public/chibi` 等稳定文件名资源在 `vercel.json` 中加长 `Cache-Control`（如 7 天）。文件名固定不变时安全，可消除每次 must-revalidate 的 RTT。**风险**：今后替换同名图片需手动刷新 CDN。
3. **可选（代码）**：进入收藏夹时先只请求当前卡图片，当前卡 `complete` 后再发相邻卡请求（串行化降低弱网并发争抢）。改动小，但收益有限。

### P2
1. **诊断增强（推荐先做）**：将 `video.play().catch(()=>{})` 改为记录拒绝原因（`err.name`），便于在用户设备上定位是 NotAllowedError 还是网络问题。改动 ~3 行。
2. **iOS 兜底**：在 Live 卡上增加一个不显眼的"点击播放"提示或首次 touchstart 时 toast 提示；低电量模式下这是唯一合规路径。
3. **不建议**：转码视频格式（H.264 已是最兼容）、全量预加载（违反约束）。

### 方案影响面
- 方案 P1-2 仅影响缓存头，不改功能；P1-3 仅改变请求时序；P2-1 仅加日志。均不触碰 Message/Chat/字体/api。

## 六、是否需要真机 iOS Safari 验证

**需要。** 本轮所有"正常"结论均来自 Chromium。iOS Safari 的差异点（低电量模式禁播、transient activation、解码器行为）无法在本环境复现。建议用户在手机上：① 开/关低电量模式各进一次收藏夹对比；② 进 Live Photo 后**触摸一下照片区域**看是否开始播放——若触摸后能播，即确认为自动播放策略问题而非加载问题。

## 七、结论

- **P1 真实根因**：非代码缺陷，为用户设备→Vercel CDN 网络可达性 + `must-revalidate` 缓存策略在弱网下的放大效应。代码侧请求/解码/显示链路全部正常。
- **P2 真实根因**：测试环境播放完全正常；用户端最可能为同源网络问题（视频下载不完整→显示 poster 静态帧）或 iOS 自动播放策略（低电量/无手势），当前代码静默吞掉 play() 拒绝原因导致无法区分，建议先加日志再定修复。
- 本轮未做任何代码修改，等待审查后再决定最小修复方案。
