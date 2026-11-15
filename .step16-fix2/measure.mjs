// Step16-fix2 测量：区分"传输时间"与"渲染/解码时间"
// 用法: node measure.mjs <baseUrl> <label>
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4174';
const LABEL = process.argv[3] || 'local';
const OUT = path.resolve('.step16-fix2');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { child, wsUrl } = await launchEdge({ port: 9233 });
const browser = new CDP(wsUrl);
await browser.connect();
const requests = new Map(); // url -> {start, end, size, type}
browser.on((msg) => {
  const p = msg.params || {};
  if (msg.method === 'Network.requestWillBeSent') {
    requests.set(p.requestId, { url: p.request.url, start: p.timestamp, type: p.type, end: null, size: null });
  } else if (msg.method === 'Network.loadingFinished') {
    const r = requests.get(p.requestId);
    if (r) { r.end = p.timestamp; r.encoded = p.encodedDataLength; }
  } else if (msg.method === 'Network.responseReceived') {
    const r = requests.get(p.requestId);
    if (r) r.mime = p.response.mimeType;
  }
});

const page = await newPage(browser, { w: 390, h: 844 });
await page.send('Network.enable');
await page.send('Network.setCacheDisabled', { cacheDisabled: true }); // 冷缓存

const t0 = Date.now();
const rel = () => +((Date.now() - t0) / 1000).toFixed(2);

try {
  await page.navigate(BASE + '/');
  await sleep(3000);
  const caution = await page.evalJS(`document.title.includes('Caution')`);
  if (caution) {
    console.log('INFO pinggy interstitial -> access()');
    await page.evalJS('access()');
    await sleep(5000);
  }
  await page.waitFor('!!document.querySelector(".start-icon")', 120000);
  await sleep(300);
  console.log(`[${rel()}s] launch ready`);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 60000);
  console.log(`[${rel()}s] home entered`);
  await page.evalJS('localStorage.clear()');

  // ===== Collection 首进：记录每张图的"赋src时间/complete时间" =====
  const colT = Date.now();
  // 立即开始轮询：记录每张 img 首次 complete 的相对时间（相对 collection 点击）
  const imgSeen = {};
  await page.clickEl(0);
  await page.waitFor('!!document.querySelector(".photo-container")', 30000);
  console.log(`[${rel()}s] collection mounted`);
  let settled = false;
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    const st = await page.evalJS(`(() => {
      const imgs = [...document.querySelectorAll('.photo-container .media-container img')];
      return imgs.map(i => ({ src: i.dataset.src || i.getAttribute('src'), hasSrc: !!i.getAttribute('src'), done: i.complete && i.naturalWidth > 0 }));
    })()`);
    const now = Date.now() - colT;
    for (const im of st) {
      const key = im.src || '(pending)';
      if (im.hasSrc && im.done && !imgSeen[key]) imgSeen[key] = now;
    }
    const withSrc = st.filter(i => i.hasSrc);
    const allDone = withSrc.length > 0 && withSrc.every(i => i.done);
    const playing = await page.evalJS(`(() => { const v = document.querySelector('.photo-container video'); return v ? !v.paused : false; })()`);
    if (allDone && playing) { settled = true; break; }
    if (i === 119) console.log(`[${rel()}s] TIMEOUT`, JSON.stringify(st));
  }
  console.log('IMG_DONE_MS(after collection click):', JSON.stringify(imgSeen));
  try { await page.shot('measure-collection', path.resolve(OUT, 'shots')); } catch {}

  // ===== Message 字体 =====
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".character")', 20000);
  await page.evalJS(`window.__fontLog = []; const origCheck = document.fonts.check.bind(document.fonts);`);
  const msgT = Date.now();
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 20000);
  console.log(`[${rel()}s] message page entered`);
  // 等信封出现并点击，打开信纸（字体在此刻才开始请求）
  const envOk = await page.waitFor('!!document.querySelector(".envelope-container.visible .envelope-image")', 40000);
  console.log(`[${rel()}s] envelope visible=${envOk}`);
  await page.clickSelector('.envelope-container');
  await sleep(600);
  // 轮询：信纸出现时间、字体 check 时间
  let letterAt = null, fontReadyAt = null;
  for (let i = 0; i < 160; i++) {
    await sleep(200);
    const st = await page.evalJS(`(() => ({
      letter: !!document.querySelector('.letter-container.visible .letter-text'),
      font: document.fonts.check('16px "Ma Shan Zheng"'),
      status: document.fonts.status,
    }))()`);
    if (st.letter && letterAt === null) { letterAt = rel(); console.log(`[${rel()}s] letter visible`); }
    if (st.font && fontReadyAt === null) { fontReadyAt = rel(); console.log(`[${rel()}s] Ma Shan Zheng font ready`); }
    if (letterAt && fontReadyAt) break;
  }
  // 字体请求明细
  const fontReqs = [...requests.values()].filter(r => /\.(woff2?|ttf|otf)/.test(r.url) || r.url.includes('fonts.g'));
  console.log('FONT_REQUESTS:', JSON.stringify(fontReqs.map(r => ({ url: r.url.slice(0, 110), start: r.start, end: r.end, size: r.encoded })), null, 1));
  // 信纸内实际计算字体
  const fontUsed = await page.evalJS(`(() => { const t = document.querySelector('.letter-text p'); return t ? getComputedStyle(t).fontFamily : null; })()`);
  console.log('letter fontFamily:', fontUsed);

  // ===== 汇总网络请求（图片/视频，含传输耗时）=====
  const interesting = [...requests.values()].filter(r => /\.(webp|png|jpe?g|mp4|mov|css|js)(\?|$)/.test(r.url) && r.url.startsWith(BASE));
  const summary = interesting.map(r => ({
    url: r.url.replace(BASE, ''), type: r.type, mime: r.mime,
    start: r.start ? +(r.start - requests.values().next().value.start || 0).toFixed(2) : null,
    dur: r.start && r.end ? +((r.end - r.start) * 1000).toFixed(0) + 'ms' : null,
    size: r.encoded ? (r.encoded / 1024).toFixed(0) + 'KB' : null,
  }));
  fs.writeFileSync(path.join(OUT, `netlog-${LABEL}.json`), JSON.stringify({ imgSeen, fontReqs, summary, letterAt, fontReadyAt, settled }, null, 2));
  console.log(`DONE label=${LABEL} letterAt=${letterAt} fontReadyAt=${fontReadyAt}`);
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
} finally {
  browser.close(); child.kill();
}
