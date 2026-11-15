# LiveDiag 诊断版本部署报告（状态：待确认）

## 已完成

- **诊断分支**: `diag/livediag`（从 `6d34954` 切出，**未合并 master**）
- **Commit**: `b397c39` — "diag: add LiveDiag play() error logging for collection Live Photo"
- **已推送**: `origin/diag/livediag`（GitHub 接受，分支追踪已建立）
- **稳定基线未动**: `master` 仍为 `6d34954`，标签 `step16-fix3-stable` → `cafc321` 未移动，Production 未重新部署

## 修改文件清单（仅 1 个源文件）

- `src/pages/Collection.jsx`：新增 `logPlayError()`（约 L17–31）+ 4 处 `play().catch` 接入。纯日志，零行为变化。
- `.step16-collection-diagnosis/`：诊断报告与原始数据（无功能代码）

## 日志覆盖位置

| trigger | 场景 |
|---|---|
| `canplay` / `loadeddata` | 数据就绪自动补播被拒 |
| `initial-timer` | 进入页面 500ms 首播被拒 |
| `touchstart` | 手势兜底播放被拒 |
| `switch` | 切换到 live 卡播放被拒 |

字段：`trigger, index, name, message, readyState, networkState, paused, currentTime, src`。仅 `console.warn`，失败时才输出。

## ⚠️ 阻塞项：Preview URL 无法确认

推送后按 Vercel 分支别名规则尝试以下地址，**均返回 404**：

- `1201-private-channel-git-diag-livediag-kovvvvvee.vercel.app`
- `1201-private-channel-git-diag-livediag.vercel.app`
- `1201-private-channel-git-master-kovvvvvee.vercel.app`（对照，亦 404）

本机环境无 Vercel CLI 登录态（`com.vercel.cli` 无 token）、无 `VERCEL_TOKEN`、无 `gh` CLI，无法查询 deployment 状态。生产域名 `1201-private-channel-rcw9-dun.vercel.app` 正常，说明项目本身在线。

**可能原因**（需在 Vercel Dashboard 确认）：
1. 分支 Preview 部署仍在构建队列中（已等待 ~5 分钟）；
2. 项目设置关闭了非生产分支的 Preview 部署；
3. Vercel Deployment Protection 对未授权访问返回 404；
4. 团队 slug 不是 `kovvvvvee`，分支别名格式不同。

## 需要用户操作（二选一）

### 方案 A：Vercel Dashboard（推荐）
1. 打开 Vercel → 项目 `1201-private-channel` → **Deployments**；
2. 找到 branch 为 `diag/livediag`、commit `b397c39` 的部署（应标记 Preview）；
3. 若存在：复制其 URL 给我验证；若不存在：说明 Preview 未触发，检查 Settings → Git → Preview Deployments 是否开启；
4. 若部署被 Deployment Protection 拦截：在部署详情页关闭保护或获取 bypass token。

### 方案 B：CLI 部署（需登录）
在本机执行 `npx vercel login` 完成授权后告诉我，我可执行 `vercel link` + `vercel`（默认生成 Preview，不动 Production）。

### 方案 C：临时隧道备选（不依赖 Vercel）
本地 `dist/` 已是含 LiveDiag 的构建（hash `index-C79HgkfW.js`）。如批准，我可用 pinggy 隧道暴露该构建供手机测试——效果等同 Preview，但地址有效期约 60 分钟。

## 部署隔离证明

- Production 域名指向 `master` 分支部署，诊断分支不触发 Production 重建（Vercel 规则：仅 production branch 部署到 Production 域名）；
- `diag/livediag` 未合并、未 PR、master 无新提交；
- 标签 `step16-fix3-stable` 未移动；
- Preview 与 Production 共享同一 `api/chat.js`——**手机测试时请勿在特别通讯发消息**（会调用真实 DeepSeek）；收藏夹诊断不涉及 API。

## 手机测试方法

### 日志获取（无需电脑/Mac 的方案）

在手机浏览器地址栏新建书签，URL 填入以下 bookmarklet（一次性，临时，不改页面行为）：

```
javascript:(()=>{if(window.__ld)return;const d=document.createElement('div');d.style.cssText='position:fixed;bottom:0;left:0;right:0;max-height:45%;overflow:auto;background:rgba(0,0,0,.88);color:#7fff9f;font:11px/1.5 monospace;z-index:2147483647;padding:6px;white-space:pre-wrap';document.documentElement.appendChild(d);const w=console.warn.bind(console);console.warn=(...a)=>{d.textContent+='\n'+a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ');w(...a)};const e=console.error.bind(console);console.error=(...a)=>{d.textContent+='\n'+a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ');e(...a)};d.textContent='[LiveDiag overlay on]'})()
```

使用：打开 Preview 地址 → 进入收藏夹 → 点书签 → 底部出现黑色日志条 → 复现 Live Photo 问题 → **截图发给我**（`[LiveDiag]` 行含 trigger/readyState/error name）。

### 测试步骤
1. 清浏览器缓存（或无痕窗口）；
2. 打开 Preview 地址 → 首页 → 收藏夹；
3. 观察：照片是否显示、Live Photo 是否播放；
4. 不播放时**触摸一次照片区域**再观察；
5. 截图日志条 + 描述现象（Wi-Fi/4G、普通/低电量模式）。

## 关闭 Preview 的方式

- Vercel Dashboard → Deployments → 该部署 → **Delete**；或
- `git push origin --delete diag/livediag`（分支删除后别名失效，deployment 记录仍在 dashboard 可手动删）。

**当前状态：分支已推送，等待 Preview URL 确认。暂停，不进行后续修复。**
