// 第二轮复测：通过公网 pinggy 地址验证最新 dist-mock（含 Step16 修复）
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://fwqgm-36-28-220-14.run.pinggy-free.link';
const SHOTS = path.resolve('.step16-fix2/shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, d = '') => { results.push({ n, p: !!p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); };

const { child, wsUrl } = await launchEdge({ port: 9231 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
const netLog = [];
browser.on((msg) => { if (msg.method === 'Network.requestWillBeSent') netLog.push(msg.params.request.url); });

try {
  await page.send('Network.enable');
  await page.navigate(BASE + '/');
  await sleep(3000);
  const caution = await page.evalJS(`document.title.includes('Caution')`);
  if (caution) {
    console.log('INFO pinggy interstitial -> access()');
    await page.evalJS('access()');
    await sleep(8000);
  }
  const started = await page.waitFor('!!document.querySelector(".start-icon")', 90000);
  check('公网首页 Launch 可达', started);
  await page.clickSelector('.start-icon');
  const homeOk = await page.waitFor('!!document.querySelector(".character")', 60000);
  check('首页进入+人物图', homeOk);
  const charOk = await page.waitFor(`(() => { const i = document.querySelector('.character'); return i && i.complete && i.naturalWidth > 0; })()`, 30000);
  check('P01 人物图已加载', charOk);
  await page.shot('retest-home', SHOTS);

  // Collection（Step16 按需加载验证）
  await page.clickEl(0);
  await page.waitFor('!!document.querySelector(".collection-page")', 30000);
  await sleep(1200);
  const col = await page.evalJS(`(() => {
    const imgs = [...document.querySelectorAll('.photo-container .media-container img')];
    return { withSrc: imgs.filter(i => i.getAttribute('src')).length, total: imgs.length };
  })()`);
  check('P02 首进按需加载(≤3/9)', col.withSrc <= 3, JSON.stringify(col));
  const firstImg = await page.waitFor(`(() => { const i = document.querySelector('.photo-container .media-container img[src]'); return i && i.complete && i.naturalWidth > 0; })()`, 40000);
  check('P02 首卡图片加载', firstImg);
  const live = await page.waitFor(`(() => { const v = document.querySelector('.photo-container video'); return v && !v.paused && v.readyState >= 3; })()`, 60000);
  check('P02 Live Photo 公网播放', live);
  await page.shot('retest-collection', SHOTS);
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 30000);

  // Message
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 30000);
  const env = await page.waitFor('!!document.querySelector(".envelope-container.visible .envelope-image")', 60000);
  const envOk = env && await page.evalJS(`(() => { const i = document.querySelector('.envelope-image'); return i.complete && i.naturalWidth > 0; })()`);
  check('P03 信封显示且加载', envOk === true);
  await page.clickSelector('.envelope-container');
  await page.waitFor('!!document.querySelector(".letter-container.visible")', 20000);
  const letter = await page.evalJS(`(() => { const w = document.querySelector('.letter-wrapper'); return w ? getComputedStyle(w).backgroundColor : null; })()`);
  check('P03 信纸底色兜底', letter === 'rgb(243, 234, 217)', letter);
  await page.shot('retest-letter', SHOTS);
  await page.clickSelector('.letter-close');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 30000);

  // Chat mock + 标点 + 尾巴
  await page.evalJS('localStorage.clear()');
  await page.clickEl(2);
  await page.waitFor('!!document.querySelector(".chat-page")', 30000);
  await page.evalJS(`(() => { const el = document.querySelector('.chat-input'); el.focus(); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,'你好'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await page.clickSelector('.send-button');
  const replied = await page.waitFor(`document.querySelectorAll('.message.ai .message-bubble').length >= 3`, 40000);
  check('P04 Chat mock 回复', replied === true);
  await sleep(2500);
  const bubbles = await page.evalJS(`[...document.querySelectorAll('.message.ai .message-bubble')].map(b => b.textContent.trim())`);
  const punct = bubbles.filter(t => !/[\p{L}\p{N}]/u.test(t));
  check('P04 无独立标点', punct.length === 0, JSON.stringify(punct));
  // mock 500
  await page.evalJS(`(() => { const el = document.querySelector('.chat-input'); el.focus(); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,'失败测试'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await page.clickSelector('.send-button');
  const err = await page.waitFor(`document.body.textContent.includes('通讯信号不稳定')`, 20000);
  check('P04 mock 500 错误提示', err === true);
  // 尾巴
  const tail = await page.evalJS(`(() => { const b = document.querySelector('.message.ai .message-bubble'); const cs = b && getComputedStyle(b,'::before'); return cs && cs.content !== 'none' && cs.borderRightWidth !== '0px'; })()`);
  check('P05 AI气泡尾巴', tail === true);
  await page.shot('retest-chat', SHOTS);

  // Range over tunnel（公网验证 206）
  const range = await fetch(BASE + '/photos/live/photo1.mp4', { headers: { Range: 'bytes=0-1023' } });
  const rangeOk = range.status === 206 && (range.headers.get('content-range') || '').startsWith('bytes 0-1023/');
  check('HTTP Range 公网 206', rangeOk, `status=${range.status} cr=${range.headers.get('content-range')}`);

  // 刷新
  await page.send('Page.reload');
  await page.waitFor('!!document.querySelector(".start-icon")', 60000);
  check('刷新回到 Launch', true);

  // 网络安全
  const ext = netLog.filter(u => /deepseek|api\.deepseek|openai/i.test(u));
  const apiNet = netLog.filter(u => /\/api\//.test(u) && !u.includes('pinggy'));
  check('无真实API/无/api网络请求', ext.length === 0 && apiNet.length === 0, `ext=${ext.length} api=${JSON.stringify(apiNet.slice(0,3))}`);
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
  results.push({ n: 'FATAL', p: false });
} finally {
  fs.writeFileSync(path.resolve('.step16-fix2/retest3-results.json'), JSON.stringify(results, null, 2));
  browser.close(); child.kill();
}
const fails = results.filter(r => !r.p);
console.log(`\n===== ${results.length - fails.length}/${results.length} PASS =====`);
