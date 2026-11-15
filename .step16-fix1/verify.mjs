// Step16 修复验证：冷/热缓存 + 真实浏览器（Edge headless CDP）
// 目标：http://localhost:4174 （dist-mock，含 Mock /api/chat）
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:4174';
const OUT = path.resolve('.step16-fix1');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, pass, extra = '') => {
  results.push({ n: name, p: !!pass, extra });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startFromLaunch(page) {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon, .launch-screen")', 20000);
  await sleep(300);
  await page.clickSelector('.start-icon');
  // 等待进入 Home（character img 出现）
  await page.waitFor('!!document.querySelector(".character")', 20000);
}

async function enterCollection(page) {
  await page.clickEl(0); // 收藏夹
  await page.waitFor('!!document.querySelector(".collection-page .photo-container")', 10000);
}
async function enterMessage(page) {
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 10000);
}
async function enterChat(page) {
  await page.clickEl(2);
  await page.waitFor('!!document.querySelector(".chat-page")', 10000);
}
async function backHome(page) {
  await page.clickSelector('.back-button, .back-btn');
  await page.waitFor('!!document.querySelector(".character")', 10000);
}

const { child, wsUrl } = await launchEdge({ port: 9224 });
const browser = new CDP(wsUrl);
await browser.connect();
const netLog = [];
browser.on((msg) => {
  if (msg.method === 'Network.requestWillBeSent') {
    netLog.push(msg.params.request.url);
  }
});

try {
  // ============ 页面1：冷缓存（禁用 HTTP cache）============
  const page = await newPage(browser, { w: 390, h: 844 });
  await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });

  // ===== P01 首页人物图（冷缓存）=====
  const t0 = Date.now();
  await startFromLaunch(page);
  const charReady = await page.waitFor(`(() => { const i = document.querySelector('.character'); return i && i.complete && i.naturalWidth > 0; })()`, 30000);
  const charMs = Date.now() - t0;
  check('P01 冷缓存人物图在进入Home时已可显示', charReady, `waited=${charMs}ms`);
  const charInfo = await page.evalJS(`(() => { const i = document.querySelector('.character'); return { complete: i.complete, nw: i.naturalWidth, src: i.currentSrc || i.src }; })()`);
  check('P01 人物图 naturalWidth>0', charInfo.nw > 0, JSON.stringify(charInfo));
  await page.shot('p01-home-char', SHOTS);

  // home 溢出 + 对话框
  const homeOverflow = await page.evalJS(`document.scrollingElement.scrollWidth - document.documentElement.clientWidth`);
  check('P-all 390px home 无横向溢出', homeOverflow <= 1, `overflow=${homeOverflow}px`);
  // 点击角色触发对话，检查气泡不越界
  await page.clickSelector('.character');
  await sleep(400);
  const bubRect = await page.evalJS(`(() => { const b = document.querySelector('.dialogue-bubble'); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, right: r.right, vw: innerWidth }; })()`);
  check('P01 对话气泡不越界', bubRect && bubRect.left >= 0 && bubRect.right <= bubRect.vw + 1, JSON.stringify(bubRect));
  await page.shot('p01-home-dialogue', SHOTS);
  await page.evalJS('localStorage.clear()'); // 清空历史消息，保证 P04 只统计本次回复

  // ===== P02 Collection 冷缓存首次进入 =====
  await enterCollection(page);
  await sleep(800);
  const colCold = await page.evalJS(`(() => {
    const imgs = [...document.querySelectorAll('.photo-container .media-container img')];
    const withSrc = imgs.filter(i => i.getAttribute('src'));
    const loaded = withSrc.filter(i => i.complete && i.naturalWidth > 0);
    const chibi = document.querySelector('.chibi-character');
    return {
      totalImgs: imgs.length,
      withSrc: withSrc.length,
      loaded: loaded.length,
      chibiOk: chibi && chibi.complete && chibi.naturalWidth > 0,
      chibiSrc: chibi && chibi.currentSrc,
    };
  })()`);
  check('P02 冷缓存首次进入：图片按需加载（≤3张有src）', colCold.withSrc <= 3, JSON.stringify(colCold));
  const firstImgOk = await page.waitFor(`(() => { const i = document.querySelector('.photo-container .media-container img[src]'); return i && i.complete && i.naturalWidth > 0; })()`, 30000);
  check('P02 冷缓存首卡图片加载完成', firstImgOk);
  const chibiOk = await page.waitFor(`(() => { const c = document.querySelector('.chibi-character'); return c && c.complete && c.naturalWidth > 0; })()`, 20000);
  check('P02 冷缓存 Q版图加载完成', chibiOk);
  // Live Photo：等待 video playing
  const liveOk = await page.waitFor(`(() => { const v = document.querySelector('.photo-container video'); return v && !v.paused && v.readyState >= 3; })()`, 30000);
  check('P02 Live Photo 首个视频播放（冷缓存）', liveOk);
  const vidInfo = await page.evalJS(`(() => { const v = document.querySelector('.photo-container video'); return v ? { paused: v.paused, rs: v.readyState, ns: v.networkState, src: v.currentSrc } : null; })()`);
  console.log('  video:', JSON.stringify(vidInfo));
  await page.shot('p02-collection-live', SHOTS);

  // 切换到下一张（非 live）再切回，验证视频恢复
  await page.swipeOn('.photo-container', 0.8, 0.2);
  await sleep(900);
  await page.swipeOn('.photo-container', 0.2, 0.8);
  await sleep(1200);
  const liveBack = await page.evalJS(`(() => { const v = document.querySelector('.photo-container video'); return v ? { paused: v.paused, rs: v.readyState } : null; })()`);
  check('P02 切换后滑回 live 视频恢复', liveBack && !liveBack.paused, JSON.stringify(liveBack));

  // ===== P03 Message =====
  await backHome(page);
  await enterMessage(page);
  // 等信封出现（3条文案约8s）
  const envOk = await page.waitFor(`(() => { const e = document.querySelector('.envelope-container.visible .envelope-image'); return e && e.complete && e.naturalWidth > 0; })()`, 25000);
  check('P03 信封 webp 显示且加载完成', envOk);
  await page.shot('p03-envelope', SHOTS);
  await page.clickSelector('.envelope-container');
  await sleep(800);
  const letter = await page.evalJS(`(() => {
    const w = document.querySelector('.letter-wrapper');
    const t = document.querySelector('.letter-text');
    if (!w || !t) return null;
    const cs = getComputedStyle(w);
    return {
      bgColor: cs.backgroundColor,
      hasBgImg: cs.backgroundImage.includes('letter.webp'),
      textVisible: getComputedStyle(t).opacity !== '0',
    };
  })()`);
  check('P03 信纸 webp 背景 + 纸色兜底', letter && letter.hasBgImg && letter.bgColor === 'rgb(243, 234, 217)', JSON.stringify(letter));
  await page.shot('p03-letter', SHOTS);
  await page.clickSelector('.letter-close');
  await sleep(600);

  // ===== P04+P05 Chat =====
  await enterChat(page);
  await sleep(500);
  // 发送两条消息，收集 AI 气泡文本
  const sentTexts = [];
  for (const msg of ['你好', '失败测试', '再聊聊']) {
    await page.typeInto('.chat-input', msg);
    await page.pressEnter('.chat-input');
    await sleep(300);
    // 等待 AI 回复气泡出现（流式逐句，最多 20s）
    await page.waitFor(`document.querySelectorAll('.message.ai .message-bubble').length > ${sentTexts.length ? 4 : 0} || document.querySelector('.chat-input')`, 20000);
    await sleep(4500); // 等逐句发送
    sentTexts.push(msg);
  }
  const bubbles = await page.evalJS(`[...document.querySelectorAll('.message.ai .message-bubble')].map(b => b.textContent.trim())`);
  console.log('  ai bubbles:', JSON.stringify(bubbles));
  const punctOnly = bubbles.filter(t => !/[\p{L}\p{N}]/u.test(t));
  check('P04 无独立标点消息', punctOnly.length === 0, `punctOnly=${JSON.stringify(punctOnly)}`);
  const doublePunct = bubbles.filter(t => /？。|!。|。！|。。/.test(t));
  check('P04 无双标点粘连', doublePunct.length === 0, JSON.stringify(doublePunct));
  const errShown = bubbles.some(t => t.includes('通讯信号'));
  check('P04 mock 500 错误提示显示', errShown);
  // 头像（随消息渲染）
  const avatarInfo = await page.evalJS(`(() => [...document.querySelectorAll('.message-avatar img')].map(i => ({ c: i.complete, nw: i.naturalWidth, src: i.currentSrc })))()`);
  const avatarOk = avatarInfo.length > 0 && avatarInfo.every(i => i.c && i.nw > 0);
  check('P05 头像图片已加载', avatarOk, JSON.stringify(avatarInfo.slice(0, 4)));
  // 尾巴检查
  const tail = await page.evalJS(`(() => {
    const ai = document.querySelector('.message.ai .message-bubble');
    const user = document.querySelector('.message.user .message-bubble');
    const aiBefore = ai && getComputedStyle(ai, '::before');
    const aiAfter = ai && getComputedStyle(ai, '::after');
    const userBefore = user && getComputedStyle(user, '::before');
    const avatar = document.querySelector('.message.ai .message-avatar');
    const ar = avatar && avatar.getBoundingClientRect();
    const br = ai && ai.getBoundingClientRect();
    return {
      aiTail: aiBefore && aiBefore.content !== 'none' && aiBefore.borderRightWidth !== '0px',
      aiTailPos: aiBefore && { left: aiBefore.left, top: aiBefore.top },
      aiFill: aiAfter && aiAfter.content !== 'none',
      userTail: userBefore && userBefore.content !== 'none' && userBefore.borderLeftWidth !== '0px',
      gap: ar && br ? +(br.left - ar.right).toFixed(1) : null,
    };
  })()`);
  check('P05 AI气泡有向左尾巴(描边+填充)', tail.aiTail && tail.aiFill, JSON.stringify(tail));
  check('P05 尾巴位于头像侧(gap≈10px)', tail.gap !== null && tail.gap >= 0 && tail.gap <= 14, `gap=${tail.gap}`);
  check('P05 用户气泡有向右尾巴', tail.userTail);
  await page.shot('p05-chat-tail', SHOTS);

  // ===== 移动宽度回归（当前在 chat 页）=====
  for (const w of [320, 375, 430]) {
    await page.viewport(w, 844);
    await sleep(300);
    await backHome(page);
    await sleep(300);
    const ovH = await page.evalJS(`document.scrollingElement.scrollWidth - document.documentElement.clientWidth`);
    check(`P-all ${w}px home 无横向溢出`, ovH <= 1, `overflow=${ovH}px`);
    await enterChat(page);
    await sleep(400);
    const ovC = await page.evalJS(`document.scrollingElement.scrollWidth - document.documentElement.clientWidth`);
    check(`P-all ${w}px chat 无横向溢出`, ovC <= 1, `overflow=${ovC}px`);
    await page.viewport(390, 844);
  }
  await backHome(page);

  // ===== 网络安全 =====
  const bad = netLog.filter(u => /deepseek|openai|api\.deepseek|sk-[a-zA-Z0-9]/i.test(u));
  check('无真实 API 请求', bad.length === 0, JSON.stringify(bad.slice(0, 3)));
  const externals = [...new Set(netLog.filter(u => /^https?:\/\//.test(u) && !u.startsWith(BASE)))];
  console.log('  externals:', JSON.stringify(externals));
  check('仅字体CDN等无害外联', externals.every(u => /fonts\.(googleapis|gstatic)\.com/.test(u)), JSON.stringify(externals));

  // ============ 页面2：热缓存（同 profile，cache enabled）============
  const page2 = await newPage(browser, { w: 390, h: 844 });
  await page2.send('Network.enable');
  await startFromLaunch(page2);
  await enterCollection(page2);
  await sleep(500);
  const hot1 = await page2.evalJS(`(() => {
    const imgs = [...document.querySelectorAll('.photo-container .media-container img')];
    return { withSrc: imgs.filter(i => i.getAttribute('src')).length };
  })()`);
  // 第二次进入（home→collection）
  await backHome(page2);
  await enterCollection(page2);
  const hotOk = await page2.waitFor(`(() => { const i = document.querySelector('.photo-container .media-container img[src]'); return i && i.complete && i.naturalWidth > 0; })()`, 10000);
  const hot2 = await page2.evalJS(`(() => {
    const imgs = [...document.querySelectorAll('.photo-container .media-container img')];
    const loaded = imgs.filter(i => i.getAttribute('src') && i.complete && i.naturalWidth > 0);
    return { withSrc: imgs.filter(i => i.getAttribute('src')).length, loaded: loaded.length };
  })()`);
  check('P02 热缓存二次进入图片全部就绪', hotOk && hot2.loaded === hot2.withSrc, `first=${JSON.stringify(hot1)} second=${JSON.stringify(hot2)}`);
  await page2.shot('p02-collection-hot', SHOTS);

} catch (e) {
  console.error('FATAL', e);
  results.push({ n: 'FATAL', p: false, extra: String(e).slice(0, 300) });
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const pass = results.filter(r => r.p).length;
  console.log(`\n==== ${pass}/${results.length} PASS ====`);
  browser.close();
  child.kill();
}
