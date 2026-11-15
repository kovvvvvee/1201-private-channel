# Step 16 Collection 诊断补充报告

基线：`cafc321` / 标签 `step16-fix3-stable`。本轮仅补充诊断证据 + 新增播放失败日志（不改变任何加载/播放策略），未 push、未部署。

## 一、P1 图片网络诊断 — Vercel 响应头实测证据

抓取方式：CDP `Network.responseReceived` 事件，真实浏览器访问生产环境，分别记录冷缓存（`Network.setCacheDisabled`）与同会话两次热缓存进入。

### 冷缓存（首次进入收藏夹，浏览器缓存禁用）

| 资源 | HTTP | x-vercel-cache | Age | Cache-Control | ETag | Content-Length |
|---|---|---|---|---|---|---|
| Q01.webp | 200 | HIT | 318 | public, max-age=0, must-revalidate | "48c9…d2c9" | 87,104 |
| Q02.webp | 200 | HIT | 318 | 同上 | "b56e…5ee3" | 73,794 |
| Q04.webp | 200 | HIT | 318 | 同上 | "64d8…b9a6" | 100,638 |
| photo1.webp | 200 | HIT | 318 | 同上 | "2e35…9b48" | 59,484 |
| photo2.webp | 200 | HIT | 318 | 同上 | "38d9…b7d0" | 45,868 |
| photo9.webp | 200 | HIT | 318 | 同上 | "d766…5089" | 89,900 |
| photo1.mp4 | **206** | HIT | 318 | 同上 | "8191…2b37" | 293,375 |

冷缓存首窗合计传输 ≈ **750 KB**（6 图 ~457KB + mp4 293KB + 边界开销）。

### 热缓存（同会话第 2、3 次进入收藏夹）

- **6 张图片：0 条网络请求**——浏览器内存/磁盘缓存直接命中，SPA 内导航不触发重新验证（无 304 请求产生）。
- **photo1.mp4：每次进入都发 206 Range 请求，完整传输 293,375 B**——`<video>` 元素每次重建都会重新拉流，媒体请求不走图片缓存路径。

### 关键判定

1. `max-age=0, must-revalidate` **并未导致每次重新下载**：同会话图片二次进入零请求；跨会话（整页刷新）时会产生条件请求→304，但响应体仍不重复传输（ETag 校验）。真正的全量重复下载只有 **mp4**。
2. `x-vercel-cache: HIT` + `Age` 递增证明 Vercel 边缘节点命中良好，**服务端/CDN 侧无瓶颈**。
3. 因此 P1 的放大因素修正为：**每次进入收藏夹固定重拉 ~293KB mp4**（弱网下这是最大单笔开销），叠加图片在跨会话场景的 304 校验 RTT；首访冷缓存 ~750KB 总量在弱网下确实可能长时间挂起。
4. 结论维持：代码链路正常，瓶颈是**客户端→Vercel 边缘的网络质量**，而非缓存策略本身。若未来要缓解，优先级最高的是给 public/ 静态资源加长 Cache-Control（文件名固定，安全）或迁移 CDN。

## 二、P2 Live Photo 播放错误诊断 — 已实施最小日志

### 现状问题

原代码所有 `video.play()` 失败均被 `.catch(() => {})` 或 `console.error` 静默吞掉，无法区分 `NotAllowedError`（策略拒绝）与网络/解码失败。

### 已实施的最小修改（仅 `src/pages/Collection.jsx`，构建已验证）

新增 `logPlayError(trigger, index, video, err)`（约 L17–31），仅 `console.warn` 输出 `[LiveDiag]` JSON，不影响 UI。覆盖全部 4 处 play 调用：

| 触发点 | trigger 值 | 位置 |
|---|---|---|
| canplay / loadeddata 事件 | `e.type`（事件名） | tryPlayIfCurrent |
| 进入页面 500ms 定时器 | `initial-timer` | 初始化 effect |
| touchstart 手势兜底 | `touchstart` | 手势监听 |
| 切换到 live 卡 | `switch` | goTo() |

日志字段：`trigger, index, name, message, readyState, networkState, paused, currentTime, src` —— 完全覆盖任务要求的 8 项信息。

**注意**：此修改仅存在于本地工作区与本地 `dist/`（hash `index-C79HgkfW.js`），**未 push、未部署**。手机端要拿到日志需要部署批准，或通过临时隧道构建测试。

### 手机端无日志时的替代诊断（不依赖控制台）

在 Safari（iOS）无法直接读 console 的情况下，可让用户用以下现象反推：
- **触摸照片区域后视频开始播** → `NotAllowedError`（自动播放策略），低电量模式可复现验证；
- **触摸后仍不播、且 Wi-Fi/4G 下都一样** → 大概率视频数据未就绪（网络）；
- **视频区长时间黑屏/花屏后恢复** → 解码或分段加载问题。

## 三、真机测试步骤（请用户按序执行）

### 准备
1. iPhone/Android 浏览器（Safari/Chrome）打开 `https://1201-private-channel-rcw9-dun.vercel.app`。
2. 清缓存：Safari 设置→Safari→清除历史记录与网站数据（或 Chrome 无痕窗口）。

### P1 图片测试
3. **Wi-Fi 下**：首次进入收藏夹，记录三张可见照片是否完整显示、耗时体感（秒）。退出再进 2 次，记录每次表现。
4. **切换移动数据**（关 Wi-Fi），重复步骤 3。
5. 记录：网络类型、首次/二次/三次进入各自的照片显示情况、有无部分加载（如只出 1–2 张）。

### P2 Live Photo 测试
6. 普通模式下进入收藏夹第一张（Live Photo），**不触摸**观察 10 秒：视频是否在动。
7. **触摸一下照片区域**，观察是否开始播放。
8. 左右滑动切换到下一张再滑回，观察视频是否恢复。
9. **开启低电量模式**（设置→电池→低电量模式），重进收藏夹重复 6–8。
10. 每步记录：是否播放、触摸后是否播放、切换后是否播放、网络类型。

### 结果判读表

| 现象 | 指向 |
|---|---|
| 图片首进空白、二三进出现，且移动数据更严重 | 确认网络瓶颈（Vercel 可达性） |
| 图片在所有网络下首进都空白 | 需进一步查（回传现象再诊断） |
| Live Photo 不动、**触摸后能播** | iOS/浏览器自动播放策略（低电量模式应同样不动） |
| Live Photo 不动、触摸也不播、mp4 明显加载慢 | 网络瓶颈（293KB 视频） |
| 切换照片后视频错位/不播放 | 代码生命周期问题（需再查） |

## 四、下一步最小修复建议（按优先级，待审查）

1. **部署含 LiveDiag 日志的构建**（待批准）：用户手机复现后即可通过 Safari Web Inspector（需 Mac）或远程调试读取 `[LiveDiag]` 精确定位 P2。
2. **P1 治本**：静态资源迁移国内可达 CDN 或 Vercel 自定义域名——唯一解决手机直连问题的方案。
3. **P1 缓解（代码）**：`vercel.json` 为 `/photos/*`、`/chibi/*` 等固定文件名资源设置 `Cache-Control: public, max-age=604800`（1 周）——文件名不变前提下安全，消除跨会话 304 校验 RTT。
4. **P1 缓解（代码）**：mp4 降码率/时长（293KB→~100KB）或改用更短循环片段，直接减小每次进入的固定开销。
5. **P2（视日志结果）**：若为 `NotAllowedError`，维持现有 touchstart 兜底并考虑首次进入时在 Live 卡上加轻提示；若为网络问题，随 P1-4 一并解决。

## 五、限制确认

未迁移 CDN、未改加载策略、未全量预加载、未动 Message/Chat/字体/API、未 push、未部署、未动 `step16-fix3-stable` 标签。`Collection.jsx` 仅新增诊断日志函数及 4 处 catch 参数，业务逻辑零变化；本地构建通过。

**暂停等待审查。**
