// Step 12 全站浏览器回归测试 —— 真实 Edge (Chromium) via CDP
import fs from 'node:fs';
import path from 'node:path';
import { launchEdge, newPage, CDP } from './cdp.mjs';

const BASE = 'http://localhost:5175';
const MOCK = 'http://localhost:3001';
const SHOTS = path.resolve('.step12-test/shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`);
}
function info(name, detail) { console.log(`INFO  ${name}  | ${detail}`); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function mock(mode) {
  await fetch(`${MOCK}/__set?mode=${mode}`);
}
async function mockCount() {
  return parseInt(await (await fetch(`${MOCK}/__count`)).text(), 10);
}

// ===== helpers =====
async function passLaunch(page) {
  const t0 = Date.now();
  const icon = await page.waitFor('!!document.querySelector(".start-icon")', 10000);
  if (!icon) return { ok: false, reason: 'start-icon not found' };
  await page.clickSelector('.start-icon');
  const home = await page.waitFor('!!document.querySelector(".bottom-nav")', 20000);
  return { ok: home, ms: Date.now() - t0 };
}

async function goHome(page) { // ensure on home
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
}

async function navTo(page, idx, pageSel) {
  await page.clickEl(idx);
  return page.waitFor(`!!document.querySelector("${pageSel}")`, 8000);
}

async function backToHome(page) {
  const back = await page.evalJS(`(() => {
    const b = document.querySelector('.back-button, .back-btn, .letter-close');
    if (b) { b.click(); return true; } return false;
  })()`);
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  return back;
}

async function seedChannel(page, remainCount, extra = {}) {
  const state = Object.assign({
    channelId: '1201', remainCount, closed: false,
    endingTriggered: false, messages: [],
  }, extra);
  await page.evalJS(`localStorage.setItem('private_channel_1201', ${JSON.stringify(JSON.stringify(state))})`);
}

async function remountChat(page) {
  // 回 home 再进 chat，触发 Chat 重新挂载读取 storage
  await page.evalJS(`(() => { const b = document.querySelector('.back-btn'); if (b) b.click(); })()`);
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  await page.clickEl(2);
  await page.waitFor('!!document.querySelector(".chat-page")', 8000);
}

async function chatBadge(page) {
  return page.evalJS(`document.querySelector('.remaining-badge')?.textContent?.trim()`);
}
async function aiBubbleCount(page) {
  return page.evalJS(`[...document.querySelectorAll('.chat-area .message.ai .message-bubble, .chat-area .message.ai')]
    .filter(el => !el.textContent.includes('正在输入')).length`);
}
async function chatTexts(page) {
  return page.evalJS(`[...document.querySelectorAll('.chat-area .message')].map(m => m.textContent.trim())`);
}
async function userTexts(page) {
  return page.evalJS(`[...document.querySelectorAll('.chat-area .message.user, .chat-area .message-user')].map(m => m.textContent.trim())`);
}
async function sendChat(page, text) {
  await page.typeInto('.chat-input', text);
  await page.clickSelector('.send-button');
}
async function waitAiReply(page, prevCount, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const n = await aiBubbleCount(page);
    if (n > prevCount) return true;
    await sleep(250);
  }
  return false;
}

// ================= main =================
const { child, wsUrl } = await launchEdge({ port: 9223 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });

try {
  // ---------- LaunchAnimation ----------
  await page.navigate(BASE + '/');
  const lp = await passLaunch(page);
  check('Launch: 点击开始后动画结束并进入 Home', lp.ok === true, `耗时 ${lp.ms}ms`);
  await sleep(1500);
  const stillHome = await page.evalJS('location.pathname');
  check('Launch: 无重复触发/卡死（停留在 /home）', stillHome === '/home', stillHome);
  await page.shot('01-launch-home-390', SHOTS);

  // ---------- Home ----------
  const bgLoaded = await page.evalJS(`performance.getEntriesByType('resource').some(e => e.name.includes('/background/home-bg.webp') && e.decodedBodySize > 0)`);
  check('Home: home-bg.webp 已加载', bgLoaded === true);
  const chLoaded = await page.evalJS(`(() => { const i = document.querySelector('.character'); return i && i.complete && i.naturalWidth > 0; })()`);
  check('Home: 角色图 xinghui-home.webp 加载完成', chLoaded === true);
  await page.clickSelector('.character');
  await sleep(400);
  const dlg = await page.evalJS(`(() => { const d = document.querySelector('.dialogue-bubble'); return d && getComputedStyle(d).opacity === '1' ? d.textContent.trim() : null; })()`);
  check('Home: 点击角色弹出对话气泡', !!dlg, dlg || '');
  await page.shot('02-home-dialogue-390', SHOTS);
  const navRect = await page.evalJS(`(() => {
    const n = document.querySelector('.bottom-nav'); const r = n.getBoundingClientRect();
    return { bottom: r.bottom, vh: innerHeight, buttons: n.querySelectorAll('.nav-button').length };
  })()`);
  check('Home: BottomNav 固定底部且 3 个按钮', navRect.buttons === 3 && Math.abs(navRect.bottom - navRect.vh) < 30, JSON.stringify(navRect));
  const keyExists = await page.evalJS(`!!document.querySelector('.hidden-key')`);
  check('Home: 隐藏钥匙彩蛋元素存在', keyExists === true);

  // ---------- Collection ----------
  await navTo(page, 0, '.collection-page');
  await page.waitFor(`document.querySelectorAll('.photo-container .photo-card').length === 9`, 8000);
  await sleep(1800); // 等 live video 初始化
  const cards = await page.evalJS(`document.querySelectorAll('.photo-container .photo-card').length`);
  check('Collection: 9 张照片卡片渲染', cards === 9, `cards=${cards}`);
  const qImgs = await page.evalJS(`[...document.querySelectorAll('.chibi-character')].map(i => i.src)`);
  const qAll = await page.evalJS(`(async () => {
    const out = {};
    for (const n of ['Q01','Q02','Q03','Q04']) {
      const im = new Image(); im.src = '/chibi/' + n + '.webp';
      await im.decode().then(() => out[n] = im.naturalWidth).catch(() => out[n] = 0);
    } return out;
  })()`);
  check('Collection: Q01-Q04 webp 均可解码', Object.values(qAll).every(v => v > 0), JSON.stringify(qAll));
  const firstImgOk = await page.evalJS(`(() => { const i = document.querySelector('.photo-container .photo-card img'); return i && i.complete && i.naturalWidth > 0; })()`);
  check('Collection: 照片图片加载完成', firstImgOk === true);
  // Live Photo: card0 is live -> video should exist and playing
  const v0 = await page.evalJS(`(() => { const v = document.querySelectorAll('.photo-container .photo-card')[0].querySelector('video'); return v ? { paused: v.paused, rs: v.readyState } : null; })()`);
  check('Collection: Live Photo(video) 自动播放', !!v0 && v0.paused === false, JSON.stringify(v0));
  await page.shot('03-collection-390', SHOTS);

  // 圆点切换 -> index 1 (普通照片)
  await page.evalJS(`document.querySelectorAll('.pagination-dot')[1].click()`);
  await sleep(900);
  const dot1 = await page.evalJS(`document.querySelectorAll('.pagination-dot')[1].classList.contains('active')`);
  const chibi1 = await page.evalJS(`document.querySelector('.chibi-character')?.src || ''`);
  check('Collection: 圆点切换到第2张', dot1 === true, chibi1);
  // live video of card0 应被清理
  const v0after = await page.evalJS(`document.querySelectorAll('.photo-container .photo-card')[0].querySelector('video')`);
  check('Collection: 离开 Live 卡后 video 被清理', v0after === null);

  // 滑动切换 -> next (index 2)
  await page.swipeOn('.photo-container', 0.8, 0.2);
  await sleep(900);
  const dot2 = await page.evalJS(`document.querySelectorAll('.pagination-dot')[2].classList.contains('active')`);
  check('Collection: 触摸滑动切换到下一张', dot2 === true);

  // 去 live 卡 index 4，验证播放；再去 index 5 验证暂停/清理
  await page.evalJS(`document.querySelectorAll('.pagination-dot')[4].click()`);
  await sleep(1200);
  const v4 = await page.evalJS(`(() => { const v = document.querySelectorAll('.photo-container .photo-card')[4].querySelector('video'); return v ? { paused: v.paused } : null; })()`);
  check('Collection: 切到 Live 卡后 video 播放', !!v4 && v4.paused === false, JSON.stringify(v4));
  // 多句评论卡 index5: 先记录评论，等待轮换
  await page.evalJS(`document.querySelectorAll('.pagination-dot')[5].click()`);
  await sleep(600);
  const c1 = await page.evalJS(`document.querySelector('.chibi-dialogue')?.textContent?.trim()`);
  await sleep(2600);
  const c2 = await page.evalJS(`document.querySelector('.chibi-dialogue')?.textContent?.trim()`);
  check('Collection: 多句评论自动轮换', c1 !== c2 && !!c2, `${c1} -> ${c2}`);
  // 返回 index0 验证循环/live 恢复
  await page.evalJS(`document.querySelectorAll('.pagination-dot')[0].click()`);
  await sleep(1200);
  const v0b = await page.evalJS(`(() => { const v = document.querySelectorAll('.photo-container .photo-card')[0].querySelector('video'); return v ? { paused: v.paused } : null; })()`);
  check('Collection: 循环回到 Live 卡 video 恢复播放', !!v0b && v0b.paused === false, JSON.stringify(v0b));
  await page.shot('04-collection-live-390', SHOTS);
  // 退出
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  check('Collection: 返回 Home 正常', (await page.evalJS('location.pathname')) === '/home');

  // ---------- Message ----------
  await navTo(page, 1, '.message-page');
  const envOk = await page.waitFor('!!document.querySelector(".envelope-container.visible .envelope-image")', 15000);
  check('Message: 信封 envelope.webp 显示', envOk === true);
  const envImg = await page.evalJS(`(() => { const i = document.querySelector('.envelope-image'); return i && i.complete && i.naturalWidth > 0; })()`);
  check('Message: envelope.webp 图片加载完成', envImg === true);
  // BGM: 默认 autoplay 策略需要手势 -> 期望出现手动播放按钮
  await sleep(1500);
  const audioBtn = await page.evalJS(`!!document.querySelector('.audio-play-button')`);
  info('Message BGM', `手动播放按钮出现=${audioBtn} (autoplay 是否被拦截取决于浏览器策略)`);
  await page.shot('05-message-envelope-390', SHOTS);
  if (audioBtn) {
    await page.clickSelector('.audio-play-button');
    let btnGone = false;
    for (let i = 0; i < 10; i++) {
      await sleep(400);
      btnGone = await page.evalJS(`!document.querySelector('.audio-play-button')`);
      if (btnGone) break;
    }
    check('Message: 手动播放入口点击后按钮隐藏(播放成功)', btnGone === true);
  } else {
    info('Message BGM', 'autoplay 直接成功，无手动按钮');
  }
  // 点开信封 -> 信纸
  await page.clickSelector('.envelope-container');
  await page.waitFor('!!document.querySelector(".letter-container.visible")', 5000);
  const letterBg = await page.evalJS(`(async () => {
    const im = new Image(); im.src = '/letter/letter.webp';
    await im.decode().catch(() => {});
    return { w: im.naturalWidth, bg: getComputedStyle(document.querySelector('.letter-wrapper')).backgroundImage.slice(0, 80) };
  })()`);
  const letterText = await page.evalJS(`document.querySelector('.letter-text')?.textContent?.length || 0`);
  check('Message: 信纸 letter.webp 背景与文字正常', letterBg.w > 0 && letterText > 100, `imgW=${letterBg.w} textLen=${letterText}`);
  await page.shot('06-message-letter-390', SHOTS);
  // 关闭信 -> 回 home，音频应暂停(代码 cleanup)
  await page.clickSelector('.letter-close');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  check('Message: 关闭信纸返回 Home', (await page.evalJS('location.pathname')) === '/home');

  // ---------- Chat ----------
  await page.evalJS(`localStorage.clear()`);
  await navTo(page, 2, '.chat-page');
  await sleep(400);
  check('Chat: 初始剩余次数 = 12', (await chatBadge(page))?.includes('12') === true, await chatBadge(page));

  // C1 发送 + loading 状态
  await sendChat(page, '你好');
  await sleep(250);
  const loading = await page.evalJS(`(() => {
    const b = document.querySelector('.send-button');
    return { disabled: b?.disabled, text: b?.textContent, typing: document.body.textContent.includes('正在输入') };
  })()`);
  info('Chat loading', JSON.stringify(loading));
  const prevAi = await aiBubbleCount(page);
  const gotReply = await waitAiReply(page, prevAi, 10000);
  check('Chat: 消息发送后 AI 回复到达', gotReply === true);
  await sleep(3500); // 等 4 句全部逐条显示
  const badge11 = await chatBadge(page);
  check('Chat: 次数 12 -> 11', badge11?.includes('11') === true, badge11);
  const texts1 = await chatTexts(page);
  check('Chat: AI 回复拆分为多条短句气泡', texts1.filter(t => !t.includes('你好')).length >= 3, JSON.stringify(texts1.slice(-6)));

  // C2 Enter 键发送
  await page.typeInto('.chat-input', '回车测试');
  await page.pressEnter('.chat-input');
  await waitAiReply(page, await aiBubbleCount(page), 10000);
  await sleep(3000);
  check('Chat: Enter 键发送正常', (await chatBadge(page))?.includes('10') === true, await chatBadge(page));

  // C3 重复文本发送
  await sendChat(page, '你好');
  await waitAiReply(page, await aiBubbleCount(page), 10000);
  await sleep(3000);
  const uTexts = await userTexts(page);
  const dupCount = uTexts.filter(t => t.includes('你好')).length;
  check('Chat: 连续发送相同文本正常', dupCount >= 2, `count=${dupCount}`);
  check('Chat: 次数 10 -> 9', (await chatBadge(page))?.includes('9') === true, await chatBadge(page));

  // C4 连点发送按钮(快速双击) -> 只应发送一次
  await page.typeInto('.chat-input', '连点测试');
  const beforeN = await userTexts(page).then(a => a.length);
  await page.clickSelector('.send-button');
  await page.clickSelector('.send-button').catch(() => {});
  await sleep(400);
  const afterN = await userTexts(page).then(a => a.length);
  check('Chat: 快速连点只发送一次', afterN - beforeN === 1, `before=${beforeN} after=${afterN}`);
  await waitAiReply(page, await aiBubbleCount(page), 10000);
  await sleep(3000);

  // C5 异常路径：mock 500
  await mock('fail');
  const badgeBefore = await chatBadge(page);
  await sendChat(page, '故障测试');
  await sleep(2500);
  const errState = await page.evalJS(`(() => ({
    errBubble: document.body.textContent.includes('通讯信号不稳定'),
    inputVal: document.querySelector('.chat-input')?.value,
    badge: document.querySelector('.remaining-badge')?.textContent.trim(),
  }))()`);
  check('Chat: API 异常时显示错误提示', errState.errBubble === true, JSON.stringify(errState));
  check('Chat: 异常后输入内容恢复', errState.inputVal === '故障测试', errState.inputVal);
  check('Chat: 异常后次数恢复', errState.badge === badgeBefore, `${badgeBefore} -> ${errState.badge}`);
  await mock('ok');
  // 清空输入框里的恢复文本，避免影响后续
  await page.typeInto('.chat-input', '');

  // C6 特殊阶段8: seed remainCount=5 -> newCount=4
  await seedChannel(page, 5);
  await remountChat(page);
  await sendChat(page, '阶段八');
  await waitAiReply(page, 0, 10000);
  await sleep(4000);
  const stage8 = await page.evalJS(`document.body.textContent.includes('时间好像过得有点快')`);
  check('Chat: 第8轮追加消息触发', stage8 === true, await chatBadge(page));

  // C7 特殊阶段10: remainCount=3 -> newCount=2
  await seedChannel(page, 3);
  await remountChat(page);
  await sendChat(page, '阶段十');
  await waitAiReply(page, 0, 10000);
  await sleep(4000);
  const stage10 = await page.evalJS(`document.body.textContent.includes('剩下的不多了呢')`);
  check('Chat: 第10轮追加消息触发', stage10 === true, await chatBadge(page));

  // ---------- 移动端视口回归（结局前，chat 仍可用） ----------
  const widths = [
    { w: 320, h: 568 }, { w: 375, h: 667 }, { w: 390, h: 844 }, { w: 430, h: 932 },
  ];
  for (const { w, h } of widths) {
    await page.viewport(w, h);
    await sleep(300);
    // Home
    await goHome(page).catch(() => {});
    // 若当前不在 home（可能在 chat），先返回
    const onHome = await page.evalJS(`!!document.querySelector('.bottom-nav')`);
    if (!onHome) {
      await page.evalJS(`(() => { const b = document.querySelector('.back-btn,.back-button'); if (b) b.click(); })()`);
      await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
    }
    const overflowHome = await page.evalJS(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
    const navFit = await page.evalJS(`(() => {
      const btns = [...document.querySelectorAll('.nav-button')];
      return btns.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
    })()`);
    check(`移动 ${w}px: Home 无横向溢出+导航不越界`, overflowHome && navFit, `overflow=${!overflowHome}`);
    if (w === 320 || w === 430) await page.shot(`m${w}-home`, SHOTS);

    // Collection
    await page.clickEl(0);
    await page.waitFor('!!document.querySelector(".collection-page")', 8000);
    await sleep(600);
    const ovC = await page.evalJS(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
    const cardR = await page.evalJS(`(() => { const r = document.querySelector('.photo-container').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; })()`);
    check(`移动 ${w}px: Collection 无横向溢出`, ovC === true, JSON.stringify(cardR));
    if (w === 320 || w === 430) await page.shot(`m${w}-collection`, SHOTS);
    await page.clickSelector('.back-button');
    await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);

    // Message
    await page.clickEl(1);
    await page.waitFor('!!document.querySelector(".message-page")', 8000);
    await sleep(800);
    const ovM = await page.evalJS(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
    check(`移动 ${w}px: Message 无横向溢出`, ovM === true);
    if (w === 320 || w === 430) await page.shot(`m${w}-message`, SHOTS);
    await page.clickSelector('.back-button');
    await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);

    // Chat
    await page.clickEl(2);
    await page.waitFor('!!document.querySelector(".chat-page")', 8000);
    await sleep(400);
    const ovCh = await page.evalJS(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
    const inputBox = await page.evalJS(`(() => { const r = document.querySelector('.chat-input').getBoundingClientRect(); return { t: r.top, b: r.bottom, vh: innerHeight, visible: r.bottom <= innerHeight && r.top >= 0 }; })()`);
    check(`移动 ${w}px: Chat 无横向溢出+输入框可见`, ovCh === true && inputBox.visible === true, JSON.stringify(inputBox));
    if (w === 320 || w === 430) await page.shot(`m${w}-chat`, SHOTS);
    // 键盘模拟：375px 时压缩高度检查输入框仍可用
    if (w === 375) {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 380, deviceScaleFactor: 3, mobile: true });
      await sleep(400);
      const kb = await page.evalJS(`(() => { const r = document.querySelector('.chat-input-area').getBoundingClientRect(); const i = document.querySelector('.chat-input').getBoundingClientRect(); return { areaBottom: r.bottom, vh: innerHeight, inputVisible: i.bottom <= innerHeight && i.top >= 0 }; })()`);
      check('移动 375px: 模拟键盘弹出后输入区仍在视口内', kb.inputVisible === true, JSON.stringify(kb));
      await page.shot('m375-chat-keyboard', SHOTS);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 3, mobile: true });
    }
    await page.evalJS(`(() => { const b = document.querySelector('.back-btn'); if (b) b.click(); })()`);
    await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  }
  await page.clearViewport();
  await page.viewport(390, 844);

  // ---------- Chat 结局流程 ----------
  await seedChannel(page, 1);
  await remountChat(page);
  await sendChat(page, '最后一句');
  await waitAiReply(page, 0, 10000);
  // 等结局消息序列 + 频道关闭 + 自动返回
  const t0 = Date.now();
  let ended = false;
  while (Date.now() - t0 < 20000) {
    const st = await page.evalJS(`({
      closing: document.body.textContent.includes('频道关闭中'),
      home: !!document.querySelector('.bottom-nav'),
      closed: JSON.parse(localStorage.getItem('private_channel_1201')||'{}').closed
    })`);
    if (st.home && st.closed) { ended = true; break; }
    await sleep(400);
  }
  check('Chat: 第12轮触发结局并自动返回 Home', ended === true);
  const closedStored = await page.evalJS(`JSON.parse(localStorage.getItem('private_channel_1201')).closed`);
  check('Chat: 频道状态已持久化 closed=true', closedStored === true);
  await page.shot('07-after-ending-home', SHOTS);
  // 已关闭状态下尝试进入 chat -> 应被拦截
  await page.clickEl(2);
  await sleep(800);
  const stillHome2 = await page.evalJS('location.pathname');
  check('Chat: 频道关闭后底部导航拦截进入', stillHome2 === '/home', stillHome2);

} catch (e) {
  console.log('FATAL', e);
  results.push({ name: 'FATAL', pass: false, detail: String(e) });
  try { await page.shot('99-fatal', SHOTS); } catch {}
} finally {
  console.log('\n===== console errors =====');
  browser.consoleErrors.slice(0, 20).forEach(e => console.log('CONSOLE:', e));
  console.log('===== exceptions =====');
  browser.exceptions.slice(0, 20).forEach(e => console.log('EXC:', e.slice(0, 300)));
  browser.close();
  child.kill();
}

// 汇总
const fails = results.filter(r => !r.pass);
console.log(`\n===== RESULT: ${results.length - fails.length}/${results.length} PASS, ${fails.length} FAIL =====`);
fails.forEach(f => console.log('FAIL:', f.name, '|', f.detail));
fs.writeFileSync(path.resolve('.step12-test/results.json'), JSON.stringify(results, null, 2));
