# Collection 阶段 1 实施报告

日期：本次会话
分支：`feat/collection-stage1`（基于 `9209d8c`，未 push）
依据：`STAGE1-IMPLEMENTATION-DESIGN.md` 及 S1–S3 补充

## 1. 修改范围

| 文件 | 改动 |
|---|---|
| `src/pages/Collection.jsx` | 唯一业务代码改动（+94/-43 行） |
| `.step16-collection-diagnosis/stage1-verify.mjs` | 新增验证脚本（不入库业务路径） |
| `.step16-collection-diagnosis/stage1-err.mjs` | 新增验证脚本 |
| `.step16-collection-diagnosis/stage1-timeout.mjs` | 新增验证脚本 |
| `.step16-collection-diagnosis/stage1-*.json` | 验证结果/日志样例 |

`git status` 确认：业务 diff 仅 `src/pages/Collection.jsx` 一个文件。`dist/index.html` 构建产物改动已还原（dist/assets 未被 git 跟踪，避免提交悬空 hash 引用）。CSS、资源、其他页面、API、部署配置零改动。

## 2. 关键实现（对应设计 5 处位置 + S1–S3）

### 2.1 调度核心 `loadWindowMedia(index, dir)`

- `loadGenRef` 代际令牌：每次调用 `++loadGenRef.current`；`release()` 首行检查 `gen !== loadGenRef.current` 直接返回 → 旧代际回调无法影响新队列。
- **P0**：`setImgSrc(index,'high')` 同步赋 `src` + `fetchpriority=high`，不等待任何事件。
- **方向性窗口**：`order = [当前, dir侧邻卡, 对侧邻卡]`，`goTo` 的 `dir` 参数传入（首次进入 dir=1 → [0,1,8]）。未扩 ±2。
- **链式放行 `release()`**：P1/P2 邻卡图片 src → `preloadChibi(当前)` → 当前 live 卡 video 创建+play。顺序执行、无并发风暴。
- **放行条件 `fire()`**：`released` 单次守卫（load/error/超时任一先到者生效，迟到事件不再重复调度）+ 3500ms `queueTimerRef` 超时兜底。超时仅放行队列，不判定失败、不取消请求（`fetchpriority=high` 保留）。
- `img.complete` 已为真（HTTP 缓存命中）时同步 `fire()`，零延迟。

### 2.2 `[ImgDiag]` 四阶段日志

`imgDiagLog(img, stage, extra)` 记录 `req / load / decode / visible`：
- `src`（资源路径）、`gen`（代际）、`now`（performance.now 绝对时间戳）
- `tReq/tLoad/tDecode/tVisibleProxy`（相对该图首次日志的 ms）
- `naturalWidth`、visible 阶段附 `opacity` 与 `proxy:true`

**限制声明**：`visible` 是 rAF+`getComputedStyle(card).opacity` 的**可见性代理值**，不是真实物理上屏时间；JS 架构无法精确测量合成器呈现时刻。

### 2.3 其他改动

- **删除** `initialPlayTimerRef` 及 +500ms 定时器；video 创建改由 `release()` 在 P0 load 后触发（`logPlayError('queue', ...)` 新 trigger 标签，LiveDiag 其余逻辑不变）。
- **删除** Q版 `useEffect` 预载（原先 currentIndex 变化即发 `new Image()`）；改为 `preloadChibi(index)` 由 `release()` 触发。可见 Q版 `<img>` 渲染不受影响。
- `goTo` 中删除同步 `createVideoForCard(index)`（现由 release 统一调度）；`loadWindowMedia(index)` → `loadWindowMedia(index, dir)`。
- 既有 video 生命周期（滑走销毁、±1 preload video、`preload="auto"`）**未改**——属阶段 2 范畴。

## 3. 验证结果

构建：`npm run build` ✓、`vite build --config vite.mock.config.js` ✓（bundle `index-CZeLIBPg.js`，190.58 kB）。

### 3.1 主验证 `stage1-verify.mjs` — 9/9 PASS

| 检查 | 结果 |
|---|---|
| T1 P0 req/load/decode/visible 日志存在 | PASS（photo1.webp 四阶段齐全） |
| T2 邻卡 req 晚于 P0 load | PASS（photo1 load@24~29ms 后 photo2/photo9 才 req） |
| T3 video 请求晚于图片 load | PASS（imgLoad≈29ms → mp4 startTime≈8946，紧随其后，+500ms 延迟已消除） |
| T4 滑动 0→1→2→3 后停留 idx=3 | PASS |
| T4 photo3/photo4 均有 req | PASS |
| T6 每张图仅 req 一次（无重复调度/无代际泄漏） | PASS |

资源时序实测（Network timing）：photo1.webp req→load ≈25–29ms；photo2/photo9/Q04 在 load 后 ~35ms 批量放行；photo1.mp4 在其后 ~10ms 发起。

### 3.2 error 兜底 `stage1-err.mjs` — 4/4 PASS

`Network.setBlockedURLs` 阻断 photo3.webp → 作为当前卡触发 error → photo4/photo2 邻卡 src 正常放行 → 继续滑动无死锁。

### 3.3 超时兜底 `stage1-timeout.mjs` — 4/4 PASS

`Network.emulateNetworkConditions`（10KB/s）使 photo1 pending → photo2/photo9 req 时间戳 = P0 req + **3506ms**（设计值 3500ms）；迟到 load 由 `released` 守卫保证不重复调度；超时后 video 正常创建（节流下 readyState=0 属预期）。

### 3.4 日志样例（`imgdiag-stage1.json`）

```json
{"src":"/photos/live/photo1.webp","stage":"req","gen":1,"now":8908.8,"tReq":0,...}
{"src":"/photos/live/photo1.webp","stage":"load","gen":1,"now":8938.3,"tLoad":29.4,"naturalWidth":962,...}
{"src":"/photos/live/photo1.webp","stage":"visible","gen":1,"now":8943.8,"tVisibleProxy":35,"opacity":"1","proxy":true,...}
{"src":"/photos/live/photo1.webp","stage":"decode","gen":1,"now":8954.9,"tDecode":46.1,...}
```

## 4. 已知限制与未解决问题

1. **`visible` 仅为代理值**：rAF+opacity 无法证明真实上屏；若 iOS WebView 存在合成器缺陷（此前 E 类假设），本日志只能给出"load/decode 正常但画面空白"的间接证据，需真机 `[ImgDiag]` + 截图比对。
2. **超时≠失败**：3500ms 放行后 P0 仍以 high priority 继续；若真机 P0 长期 pending，邻卡会以 normal priority 并行下载——这是设计内的有界降级（最多 3 图在途）。
3. **快速滑动丢帧**：`isAnimating` 450ms 窗口内的 goTo 仍被忽略（既有行为，未改）；测试以 700ms 间隔模拟有效滑动。
4. **Q版可见 img** 仍随 React 渲染立即请求（设计允许）；非当前预载已延后。
5. **video 仍在 img load 后才请求**：极端弱网下 Live Photo 首帧等待 = img load + video 缓冲，未做阶段 2 的 metadata 预载/DOM 保留。
6. 未做 iPhone/微信真机验证；本地 Chromium 结果不能外推真机行为。

## 5. 回滚方法

`git checkout cafc321 -- src/pages/Collection.jsx`（或 revert 本分支 commit）即可完整回退；无 schema/资源/配置变更，无迁移成本。

## 6. 后续建议

- 部署 Preview（需另行授权）→ iPhone 微信实测 → 用 `[ImgDiag]` 四阶段时间戳判定瓶颈在请求/解码/合成器哪一环。
- 若证实"load/decode 正常但不绘制" → 阶段 3 reflow 修复；若证实 video 生命周期问题 → 阶段 2 复用。

**本报告提交后停止，等待审查与下一步授权。不 push、不部署。**
