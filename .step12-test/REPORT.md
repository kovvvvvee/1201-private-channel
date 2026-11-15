# 1201 ｜ Step 12 全站浏览器视觉与交互回归测试报告

测试日期：2026-11-15
测试方式：真实浏览器（Microsoft Edge，Chromium 内核）通过 CDP 驱动；Vite dev server + 本地 mock `/api/chat`（SSE），未调用真实 DeepSeek API。

---

## 1. 测试环境与浏览器版本

| 项 | 值 |
|---|---|
| 浏览器 | Microsoft Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，Chromium 内核，headless=new 模式经 CDP 真实渲染） |
| 前端 | Vite 5.4.21 dev server，`http://localhost:5175`（5173/5174 被占用自动顺延） |
| 后端 | 本地 mock `node .step12-test/mock-server.mjs`，监听 `:3001`，SSE 流式回复，支持 `/__set?mode=ok|fail` 注入故障 |
| 生产验证 | `npm run build` + `vite preview :4173`（仅用于 Message/BGM 对照验证） |
| 视口 | 390×844（主测）、320×568、375×667、430×932，均启用移动端仿真 + 触摸 |

说明：本机未安装 Chrome，使用同为 Chromium 内核的 Edge 进行真实浏览器测试。所有交互均通过 CDP `Input.dispatchMouseEvent` / `Input.dispatchTouchEvent` / DOM 事件派发执行，非静态检查。

## 2. 实际测试的页面与视口

- LaunchAnimation、Home、Collection、Message、Chat：均在 **390×844** 完整流程实测。
- 移动端回归：**320 / 375 / 390 / 430** 四个宽度，逐页检查横向溢出、元素越界、输入框可见性；375px 额外做了键盘弹出模拟（视口高度压缩至 380px）。
- 截图证据：`.step12-test/shots/`（清单见 §5）。

## 3. 测试结果汇总（54 PASS / 2 FAIL / 若干 NOT TESTED）

### LaunchAnimation — PASS
- 点击开始图标后 4 条连接文案依次显示，约 8.6s 后自动进入 `/home`。
- 停留观察 1.5s+，无重复触发、无卡死，URL 稳定为 `/home`。

### Home — PASS
- `home-bg.webp` 经 `performance` 资源计时确认加载（decodedBodySize>0）。
- 角色图 `xinghui-home.webp` `complete && naturalWidth>0`。
- 点击角色弹出对话气泡（实测文案"终于等到今天了。"/"今天是特别的一天。"等随机池）。
- BottomNav `position:fixed`，bottom 与视口底部差 <30px，3 个按钮齐全。
- 隐藏钥匙 `.hidden-key` 元素存在（首次进入闪烁逻辑见 §6 未测项）。

### Collection — PASS
- 9 张照片卡片全部渲染；Q01–Q04 `.webp` 均 `decode()` 成功（naturalWidth 928–1262）。
- Live Photo：card0/4/5/7 为实况，切换到 live 卡后 `<video>` 自动播放（`paused=false, readyState=4`）；离开 live 卡后 video 元素被移除清理；循环回到 live 卡恢复播放。
- 圆点点击切换正常（active dot、Q版图、评论同步更新）；CDP 触摸滑动（touchStart→touchMove→touchEnd，右滑 80%→20%）正常切换。
- 多句评论卡（index5）实测 "我看到了" → "全都看到了" 自动轮换。
- 返回 Home 正常；未见卡顿或图片错位（截图 03/04）。

### Message — 部分 PASS / 1 FAIL
- PASS：3 条引导文案逐条显示 → `envelope.webp` 信封浮现且图片加载完成。
- PASS：点击信封 → 信纸弹窗 `letter-container.visible`，`letter.webp` 背景可解码（naturalWidth=566），正文 447 字符可读可滚动。
- PASS：关闭信纸（×）→ BGM `pause()` 被调用（CDP 钩子实测日志）→ 返回 Home。
- **FAIL**：`播放音乐` 按钮在 dev 环境下常驻且点击无效（详见问题 #1）。
- NOT TESTED：autoplay 被拦截 → 手动点击 → 播放成功 → 按钮消失 的完整链路（见 §6）。

### Chat — 大部分 PASS / 1 FAIL
- PASS：初始 `📡 12`；发送后按钮变 `发送中...` disabled、出现 `正在输入...`、AI 回复按短句逐条气泡显示（mock SSE 4 句 → 4 气泡），次数 12→11。
- PASS：Enter 键发送正常（12→11→10）；连续发送相同文本"你好"两次均正常（气泡×2，次数递减）。
- PASS：快速连点发送按钮只产生一条用户消息（防重入生效）。
- PASS：mock 注入 500 → 显示 `通讯信号不稳定……稍后再试吧。`，输入框恢复原文，console 有对应错误日志。
- PASS：特殊阶段——seed remainCount=5 发送后触发 `时间好像过得有点快……`（📡4）；remainCount=3 触发 `剩下的不多了呢。`（📡2）。
- PASS：remainCount=1 发送后触发结局序列（4 条 ending 消息 → `频道关闭中...` → 自动返回 Home），`localStorage.closed=true` 持久化；之后点击"特别通讯"被 `alert('📡 频道已关闭')` 拦截留在 Home。
- **FAIL**：API 异常后剩余次数没有恢复反而 +1（详见问题 #2）。

### 移动端 — PASS（4 视口）
| 视口 | Home | Collection | Message | Chat 输入框 |
|---|---|---|---|---|
| 320×568 | 无横向溢出，导航不越界 | 无溢出，卡片 16–304px | 无溢出 | 可见（bottom 554 ≤ 568） |
| 375×667 | 无横向溢出 | 无溢出 | 无溢出 | 可见；键盘模拟（高 380）后输入区仍在视口 |
| 390×844 | 无横向溢出 | 无溢出 | 无溢出 | 可见 |
| 430×932 | 无横向溢出 | 无溢出 | 无溢出 | 可见 |

## 4. 发现的问题

### 问题 #1（FAIL，中优先级，dev 环境）Message 页"播放音乐"按钮卡死
- **现象**：`npm run dev` 下进入留言页，BGM 实际已在播放（`play resolved paused=false`），但页面仍显示 `🎵 播放音乐` 按钮；点击按钮无任何反应，按钮永不消失。
- **根因（已用 CDP 钩子 `HTMLMediaElement.prototype.play/pause` 实证）**：`main.jsx` 启用了 `React.StrictMode`，dev 下 effect 双挂载：
  1. 第一次 `audio.play()` 被第二次挂载的 cleanup `pause()` 打断 → `AbortError` → 其 `catch` 执行 `setShowAudioButton(true)`；
  2. 第二次 `audio.play()` 实际**成功**（`paused=false`）；
  3. `handlePlayAudio` 仅在 `audio.paused===true` 时才播放，音频已在播放 → 点击空操作 → 按钮常驻。
- **影响范围**：仅 dev 构建（StrictMode 双 effect 仅开发模式）。`vite preview` 生产构建实测：autoplay 直接成功、不出现按钮，行为正常。若部署的是 dev server 或未来 StrictMode 行为变化，真机上会出现"音乐已响但仍显示播放按钮且点不动"。
- **复现步骤**：`npm run dev` → 打开首页 → 点开始 → 底部"留言" → 观察 `🎵 播放音乐` 按钮常驻，点击无效（BGM 实际已在播放）。

### 问题 #2（FAIL，高优先级）Chat API 异常后剩余次数被多加 1
- **现象**：mock 返回 500 时，发送前 `📡 8` → 发送扣至 7 → 请求失败后显示 `📡 9`（应恢复为 8）。
- **根因**：`src/pages/Chat.jsx` catch 分支 `const restoredCount = chatCount + 1;`（约 L1061）。`chatCount` 是发送前的值 C，扣减后为 C−1，恢复时应写回 C，却写成 C+1 —— 每次 API 失败净增 1 次通讯额度，可被反复触发刷次数。
- **复现步骤**：进入 Chat → 后端 `/api/chat` 返回 500（mock `__set?mode=fail`）→ 发送任意消息 → 观察 `📡` 数字比发送前多 1。
- 注：本步按要求只记录未修复。

## 5. 截图文件清单（`.step12-test/shots/`）

| 文件 | 内容 |
|---|---|
| 01-launch-home-390.png | Launch 结束后 Home（390px） |
| 02-home-dialogue-390.png | 角色对话气泡 |
| 03-collection-390.png | 收藏夹普通态 |
| 04-collection-live-390.png | 收藏夹 Live Photo 实况帧 |
| 05-message-envelope-390.png | 留言页信封 + 播放音乐按钮（问题#1 证据） |
| 06-message-letter-390.png | 信纸弹窗全文 |
| 07-after-ending-home.png | 结局后返回 Home |
| m320-home / m320-collection / m320-message / m320-chat.png | 320px 各页 |
| m375-chat-keyboard.png | 375px 键盘弹出模拟 |
| m430-home / m430-collection / m430-message / m430-chat.png | 430px 各页 |
| 99-fatal.png | 首轮脚本 seed 语法错误时的现场（非产品问题） |

原始结果：`.step12-test/results.json`（56 项断言明细）。

## 6. 未测试 / 仅代码推断项

| 项 | 状态 | 原因 |
|---|---|---|
| BGM autoplay 被拦截→手动播放→按钮消失 全链路 | NOT TESTED | headless Edge 下 `--autoplay-policy` 各档位均无法阻止 autoplay（实测 `user-gesture-required`/`document-user-activation-required`/`no-user-gesture-required` 结果一致：直接播放成功无按钮）。按钮出现路径已由 dev StrictMode 的 AbortError 间接触发验证；点击成功路径因问题#1 无法在 dev 验证，prod 又无拦截场景。真实手机浏览器（尤其 iOS Safari）才是该路径的目标环境。 |
| 频道关闭后的"频道已关闭"弹窗页 | NOT TESTED | UI 不可达：首页 `handleNavigate` 在 `closed=true` 时 `alert` 拦截，不会进入 Chat；直接访问 `/chat` 会先过 LaunchAnimation 并被重定向 `/home`。该分支仅在"聊天中途关闭后未及时返回"等边缘时序才可能渲染，无法通过正常操作到达。 |
| 钥匙彩蛋点击播放 `birthday.mp3` | NOT TESTED | 仅验证元素存在；点击会触发 `audioControl.playBirthday()`，headless 环境音频无声无法主观确认，代码路径简单未深入。 |
| LaunchAnimation 4 条文案逐条内容 | 部分推断 | 总时长 8.6s 与"4×(1.5s+0.5s)+0.5s"理论值吻合，判定 PASS；未逐帧断言每条文案文本。 |
| iOS `env(safe-area-inset-bottom)`、真实软键盘 | NOT TESTED | 桌面 headless 无法模拟真实 IMIE/安全区；以视口高度压缩近似验证输入区可见性（PASS），真实机型需真机复测。 |
| Chat 真实 AI 回复质量 | NOT TESTED | 按要求使用本地 mock，未调用 DeepSeek。 |

## 7. 静态检查与真实浏览器测试的区别

- 本报告全部 PASS/FAIL 均来自真实 Edge 渲染 + CDP 输入事件 + DOM/性能 API 断言（截图、`naturalWidth`、`video.paused`、`localStorage`、`performance` 资源计时等）。
- 仅以下内容属代码推断：Message 离开时 BGM 暂停（另有 CDP 钩子实测 `pause()` 调用日志佐证，故实际已验证）；closed-modal 不可达性（由路由 + Home 拦截逻辑推断）；`env(safe-area-inset-bottom)` 的真实设备效果。
- 发现的 2 个 FAIL 均经浏览器实测复现并定位到具体代码行，非静态推测。

## 8. 建议后续修复优先级

1. **P0 — Chat 次数恢复 bug**（`Chat.jsx` catch 分支 `chatCount + 1` → 应为发送前的 `chatCount`）：影响核心玩法计数，可被刷次数，建议最先修。
2. **P1 — Message BGM 按钮竞态**：dev 下按钮常驻且点击无效。建议 `handlePlayAudio` 改为"若已在播放则隐藏按钮"，并让 cleanup/第二次 effect 的 catch 不再无条件 `setShowAudioButton(true)`（可用 mounted ref 或检查当前 audio 状态）。
3. **P2 — 真机回归**：iOS Safari 上重点复测 Message BGM 手动播放链路、软键盘弹出时 Chat 输入区、底部安全区。
4. **P3 — 覆盖率补充**：为 closed-modal 分支补一条可达路径或删除死代码；LaunchAnimation 文案可加断言。

## 9. 其他说明

- 未修改任何项目业务代码；未触碰 `api/`、`server/`、`index.js`、密钥配置；未部署、未 push。
- 测试产物（脚本/截图/报告/mock）全部位于 `.step12-test/`，可整体删除，不影响项目。
- 测试期间 `npm run build` 重新生成了 `dist/`（构建产物，非源码改动）。
