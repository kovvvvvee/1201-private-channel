// Step16-fix3 验证：Collection/Message壁纸/信纸字体逐字/chat背景
// 用法: node verify.mjs <baseUrl> <label> [port]
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4174';
const LABEL = process.argv[3] || 'local';
const PORT = +(process.argv[4] || 9235);
const OUT = path.resolve('.step16-fix3');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, d = '') => { results.push({ n, p: !!p, label: LABEL }); console.log(`${p ? 'PASS' : 'FAIL'} [${LABEL}] ${n}${d ? ' | ' + d : ''}`); };

const { child, wsUrl } = await launchEdge({ port: PORT });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
await page.send('Network.enable');
await page.send('Network.setCacheDisabled', { cacheDisabled: true }); // 冷缓存
const t0 = Date.now();
const rel = () => +((Date.now() - t0) / 1000).toFixed(2);

try {
  await page.navigate(BASE + '/');
  await sleep(2500);
  if (await page.evalJS(`document.title.includes('Caution')`)) { console.log('interstitial->access()'); await page.evalJS('access()'); await sleep(4000); }
  await page.waitFor('!!document.querySelector(".start-icon")', 120000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 60000);
  await page.evalJS('localStorage.clear()');

  // ===== P1 Collection 首进 =====
  const colT = Date.now();
  await page.clickEl(0);
  await page.waitFor('!!document.querySelector(".photo-container")', 30000);
  // 轮询图片完成时间（当前卡优先）
  const imgSeen = {};
  let videoPlaying = false;
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    const st = await page.evalJS(`(() => {
      const imgs = [...document.querySelectorAll('.photo-container .media-container img')];
      const v = document.querySelector('.photo-container video');
      return {
        imgs: imgs.map(i => ({ src: i.dataset.src || i.src, has: !!i.getAttribute('src'), done: i.complete && i.naturalWidth > 0, fp: i.getAttribute('fetchpriority') })),
        playing: v ? !v.paused && v.readyState >= 3 : false,
      };
    })()`);
    const now = Date.now() - colT;
    for (const im of st.imgs) if (im.has && im.done && !imgSeen[im.src]) imgSeen[im.src] = now;
    if (st.playing) videoPlaying = true;
    const withSrc = st.imgs.filter(i => i.has);
    if (withSrc.length && withSrc.every(i => i.done) && videoPlaying) break;
    if (i === 149) console.log('COL_TIMEOUT', JSON.stringify(st));
  }
  console.log('IMG_DONE:', JSON.stringify(imgSeen));
  const firstImg = Object.values(imgSeen)[0];
  check('P1 首进当前卡图片加载', !!imgSeen['/photos/live/photo1.webp'], JSON.stringify(imgSeen));
  check('P1 Live Photo 自动播放', videoPlaying);
  // fetchpriority 检查：当前卡图应 high
  const fp = await page.evalJS(`(() => { const i = document.querySelector('.photo-container .media-container img[src="/photos/live/photo1.webp"]'); return i ? i.getAttribute('fetchpriority') : null; })()`);
  check('P1 当前卡 fetchpriority=high', fp === 'high', `fp=${fp}`);
  await page.shot('fix3-collection', path.join(OUT, 'shots'));
  // 离开→重进
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".character")', 20000);
  await page.clickEl(0);
  await page.waitFor('!!document.querySelector(".photo-container video")', 20000);
  const rePlay = await page.waitFor(`(() => { const v = document.querySelector('.photo-container video'); return v && !v.paused && v.readyState >= 3; })()`, 40000);
  check('P1 重进 Live Photo 恢复播放', rePlay === true);
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".character")', 20000);

  // ===== P2 Message 壁纸 + P3 字体 =====
  const msgNavT = Date.now();
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 20000);
  // 壁纸资源 timing
  await sleep(1500);
  const wp = await page.evalJS(`(() => {
    const e = performance.getEntriesByType('resource').find(r => r.name.includes('message-bg'));
    return e ? { name: e.name.split('/').pop(), start: e.startTime, end: e.responseEnd, size: e.transferSize } : null;
  })()`);
  console.log('WALLPAPER:', JSON.stringify(wp), 'msgNavAt=', Date.now() - msgNavT, 'ms');
  check('P2 壁纸为 webp 且已加载', wp && wp.name === 'message-bg.webp' && wp.size > 0, JSON.stringify(wp));
  // 等信封→打开信纸
  await page.waitFor('!!document.querySelector(".envelope-container.visible .envelope-image")', 60000);
  await page.clickSelector('.envelope-container');
  await page.waitFor('!!document.querySelector(".letter-container.visible .letter-text")', 20000);
  await sleep(800); // 等字体应用
  // 逐字检查：信纸全部字符是否都有 Ma Shan Zheng glyph
  const fontAudit = await page.evalJS(`(() => {
    const text = document.querySelector('.letter-text').textContent;
    const chars = [...new Set(text)].filter(c => c.trim());
    const missing = [];
    for (const ch of chars) {
      if (!document.fonts.check('16px "Ma Shan Zheng"', ch)) missing.push(ch);
    }
    return { total: chars.length, missing };
  })()`);
  console.log('FONT_AUDIT:', JSON.stringify(fontAudit));
  check('P3 信纸全部字符有字体 glyph', fontAudit.missing.length === 0, `missing=${JSON.stringify(fontAudit.missing)} total=${fontAudit.total}`);
  // 实际渲染字体抽查：letter-text p 的 computed font + 是否有 fallback 痕迹
  const rendered = await page.evalJS(`(() => {
    const ps = [...document.querySelectorAll('.letter-text p')];
    return ps.slice(0,3).map(p => getComputedStyle(p).fontFamily.split(',')[0]);
  })()`);
  check('P3 信纸渲染字体=Ma Shan Zheng', rendered.every(f => f.includes('Ma Shan Zheng')), JSON.stringify(rendered));
  await page.shot('fix3-letter', path.join(OUT, 'shots'));
  await page.clickSelector('.letter-close');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 20000);

  // ===== P4 Chat 背景 =====
  await page.clickEl(2);
  await page.waitFor('!!document.querySelector(".chat-page")', 20000);
  await sleep(1200);
  const cbg = await page.evalJS(`(() => {
    const e = performance.getEntriesByType('resource').find(r => r.name.includes('chat-bg'));
    return e ? { name: e.name.split('/').pop(), size: e.transferSize, end: e.responseEnd } : null;
  })()`);
  check('P4 chat 背景为 webp 已加载', cbg && cbg.name === 'chat-bg.webp' && cbg.size > 0, JSON.stringify(cbg));

  // ===== 网络安全 =====
  const ext = await page.evalJS(`performance.getEntriesByType('resource').map(e=>e.name).filter(u=>/deepseek|openai|api\\./i.test(u))`);
  check('无真实API外联', ext.length === 0, JSON.stringify(ext.slice(0,3)));

  // ===== 热缓存（同页 reload 不清缓存）=====
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  await page.send('Page.reload');
  await page.waitFor('!!document.querySelector(".start-icon")', 60000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 30000);
  const hotImg = await page.evalJS(`(() => { const i = document.querySelector('.character'); return i.complete && i.naturalWidth > 0; })()`);
  check('热缓存首页人物图即时可用', hotImg === true);
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
  results.push({ n: 'FATAL', p: false, label: LABEL });
} finally {
  const f = path.join(OUT, `results-${LABEL}.json`);
  fs.writeFileSync(f, JSON.stringify(results, null, 2));
  const pass = results.filter(r => r.p).length;
  console.log(`==== [${LABEL}] ${pass}/${results.length} PASS ====`);
  browser.close(); child.kill();
}
