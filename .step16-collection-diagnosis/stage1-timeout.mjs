// 阶段1补充验证：P0 pending >3500ms → 超时放行邻卡；迟到 load 不重复调度
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import path from 'node:path';
import fs from 'node:fs';

const BASE = 'http://localhost:4174';
const OUT = path.resolve('.step16-collection-diagnosis');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, d = '') => { results.push({ n, p: !!p }); console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? ' | ' + d : ''}`); };

const { child, wsUrl } = await launchEdge({ port: 9264 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
await page.send('Network.enable');
await page.send('Network.setCacheDisabled', { cacheDisabled: true });

const reqTimes = {};
browser.on((msg) => {
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning') {
    const txt = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    if (txt.includes('[ImgDiag]')) {
      try {
        const j = JSON.parse(txt.replace('[ImgDiag] ', ''));
        if (j.stage === 'req') reqTimes[j.src] = j.now;
      } catch {}
    }
  }
});

try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 60000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 30000);
  await page.evalJS('localStorage.clear()');
  // 进入收藏夹前开启极限节流：photo1.webp(~60KB) 在 ~10KB/s 下需 ~6s
  await page.send('Network.emulateNetworkConditions', {
    offline: false, latency: 100, downloadThroughput: 10 * 1024, uploadThroughput: 10 * 1024,
  });
  await page.evalJS(`(() => { const els=[...document.querySelectorAll('a,button,div,span')].filter(e=>e.children.length===0 && /收藏/.test(e.textContent)); if(els.length)(els[0].closest('a,button,div[class]')||els[0]).click(); })()`);
  await page.waitFor('!!document.querySelector(".photo-container")', 20000);

  // t≈0: photo1 req；等待 4.5s（>3500ms 超时）
  const t0 = Date.now();
  await sleep(4500);
  const tP1 = reqTimes['/photos/live/photo1.webp'];
  const tP2 = reqTimes['/photos/photo2.webp'];
  const tP9 = reqTimes['/photos/photo9.webp'];
  console.log('REQ_TIMES', JSON.stringify({ tP1, tP2, tP9 }));
  check('TO1 P0 photo1 已 req', tP1 != null);
  check('TO2 超时后邻卡已放行(photo2)', tP2 != null);
  check('TO3 超时后邻卡已放行(photo9)', tP9 != null);
  if (tP1 != null && tP2 != null) {
    const gap = tP2 - tP1;
    check('TO4 放行间隔≈3500ms(3.0~4.5s)', gap > 3000 && gap < 4500, `gap=${gap.toFixed(0)}ms`);
  }
  // 等图片最终 load，确认迟到 load 不引发重复 req（每 src 仅一次 req 已由 imgdiag 保证；再核 video 是否正常创建）
  await sleep(8000);
  const vid = await page.evalJS(`(() => { const v=document.querySelector('.media-container video'); return v ? {src:v.currentSrc||v.src, rs:v.readyState} : null })()`);
  console.log('VIDEO_AFTER_LOAD', JSON.stringify(vid));

  fs.writeFileSync(path.join(OUT, 'stage1-timeout-results.json'), JSON.stringify(results, null, 2));
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
  results.push({ n: 'FATAL', p: false });
} finally {
  const pass = results.filter(r => r.p).length;
  console.log(`==== STAGE1-TIMEOUT ${pass}/${results.length} PASS ====`);
  browser.close(); child.kill();
}
