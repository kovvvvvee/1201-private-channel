// 阶段1验证：ImgDiag 日志 + 链式时序 + 快速滑动 + 超时兜底模拟
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:4174';
const OUT = path.resolve('.step16-collection-diagnosis');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, d = '') => { results.push({ n, p: !!p }); console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? ' | ' + d : ''}`); };

const { child, wsUrl } = await launchEdge({ port: 9262 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
await page.send('Network.enable');
await page.send('Network.setCacheDisabled', { cacheDisabled: true });

const imgLogs = [];
const warnLogs = [];
browser.on((msg) => {
  if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'warning' || msg.params.type === 'warn')) {
    const txt = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    warnLogs.push(txt);
    if (txt.includes('[ImgDiag]')) {
      try { imgLogs.push(JSON.parse(txt.replace('[ImgDiag] ', ''))); } catch { imgLogs.push(txt); }
    }
  }
});

try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 60000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 30000);
  await page.evalJS('localStorage.clear()');

  // ===== T1 首进：链式时序 =====
  await page.evalJS(`(() => { const els=[...document.querySelectorAll('a,button,div,span')].filter(e=>e.children.length===0 && /收藏/.test(e.textContent)); if(els.length)(els[0].closest('a,button,div[class]')||els[0]).click(); })()`);
  await page.waitFor('!!document.querySelector(".photo-container")', 20000);
  await sleep(4000);

  const seq = imgLogs.filter(l => l && l.src).map(l => `${l.src.split('/').pop()}:${l.stage}@${l.tReq ?? l.tLoad ?? l.tDecode ?? l.tVisibleProxy}`);
  console.log('IMGDIAG_SEQ', JSON.stringify(seq, null, 0));

  // req 应只出现在当前卡(P0)，load/decode/visible 齐全
  const p0reqs = imgLogs.filter(l => l && l.stage === 'req');
  check('T1 P0 req 日志存在', p0reqs.length >= 1, JSON.stringify(p0reqs.map(l => l.src)));
  const p0loads = imgLogs.filter(l => l && l.stage === 'load' && l.src.includes('photo1'));
  check('T1 photo1 load 日志', p0loads.length >= 1);
  const p0dec = imgLogs.filter(l => l && l.stage === 'decode' && l.src.includes('photo1'));
  check('T1 photo1 decode 日志', p0dec.length >= 1);
  const p0vis = imgLogs.filter(l => l && l.stage === 'visible' && l.src.includes('photo1'));
  check('T1 photo1 visible代理日志', p0vis.length >= 1 && p0vis[0].proxy === true, JSON.stringify(p0vis[0] || {}));

  // ===== T2 相邻卡在 P0 load 后才发 req（时序验证）=====
  const reqTimes = {};
  imgLogs.forEach(l => { if (l && l.stage === 'req') reqTimes[l.src] = l.tReq; });
  const tPhoto1 = reqTimes['/photos/live/photo1.webp'];
  const tPhoto2 = reqTimes['/photos/photo2.webp'];
  const tPhoto9 = reqTimes['/photos/photo9.webp'];
  const tQ04 = imgLogs.find(l => l && l.stage === 'req' && (l.src || '').includes('Q04'));
  // tReq 是相对 t0 的绝对值；load 完成时间应早于邻卡 req
  const p1load = imgLogs.find(l => l && l.stage === 'load' && l.src === '/photos/live/photo1.webp');
  check('T2 邻卡 req 晚于 P0 load', p1load && tPhoto2 != null && (tPhoto2 - (p1load.tLoad || 0)) >= -50,
    `p0load=${p1load && p1load.tLoad} tPhoto2req=${tPhoto2}`);

  // ===== T3 视频在图片 load 后发起 =====
  const vidStart = await page.evalJS(`(() => { const e = performance.getEntriesByType('resource').find(r=>r.name.includes('photo1.mp4')); return e ? e.startTime : null })()`);
  check('T3 video 请求晚于图片 load', p1load && vidStart != null && vidStart > (p1load.tLoad || 0), `imgLoad=${p1load && p1load.tLoad} vidStart=${vidStart}`);

  // ===== T4 快速滑动 0→1→2→3：最新当前卡优先 =====
  for (let i = 0; i < 3; i++) {
    await page.swipeOn('.photo-container', 0.8, 0.2, 0.5);
    await sleep(700); // 超过 isAnimating 450ms 窗口，允许每次 goTo 生效
  }
  await sleep(2500);
  const curIdx = await page.evalJS(`(() => { const cards=[...document.querySelectorAll('.photo-card')]; return cards.findIndex(c=>getComputedStyle(c).opacity==='1') })()`);
  const allReqs = imgLogs.filter(l => l && l.stage === 'req').map(l => l.src);
  console.log('afterSwipes currentIdx=', curIdx, 'allReqs=', JSON.stringify(allReqs));
  check('T4 滑动后停留在目标卡', curIdx === 3, `idx=${curIdx}`);
  // photo4 应有 req；且 photo4 req 应晚于 photo3 req（新当前卡后发起）
  const rPhoto3 = imgLogs.find(l => l && l.stage === 'req' && l.src === '/photos/photo3.webp');
  const rPhoto4 = imgLogs.find(l => l && l.stage === 'req' && l.src === '/photos/photo4.webp');
  check('T4 photo3/4 均有 req', !!rPhoto3 && !!rPhoto4, `p3=${rPhoto3 && rPhoto3.tReq} p4=${rPhoto4 && rPhoto4.tReq}`);
  // 代际检查：photo2（已离开窗口的旧卡）不应在滑到3之后才新发 req——即每个 src 只 req 一次
  const reqCount = {};
  allReqs.forEach(s => { reqCount[s] = (reqCount[s] || 0) + 1; });
  const dupes = Object.entries(reqCount).filter(([, c]) => c > 1);
  check('T6 每张图仅 req 一次（无重复调度）', dupes.length === 0, JSON.stringify(dupes));

  // ===== 汇总 ImgDiag 样例 =====
  fs.writeFileSync(path.join(OUT, 'imgdiag-stage1.json'), JSON.stringify(imgLogs, null, 1));
  console.log('IMGLOG_COUNT', imgLogs.length, 'WARN_COUNT', warnLogs.length);
  const sample = imgLogs.filter(l => l && l.src && l.src.includes('photo1')).slice(0, 5);
  console.log('SAMPLE', JSON.stringify(sample, null, 1));
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
  results.push({ n: 'FATAL', p: false });
} finally {
  fs.writeFileSync(path.join(OUT, 'stage1-results.json'), JSON.stringify(results, null, 2));
  const pass = results.filter(r => r.p).length;
  console.log(`==== STAGE1 ${pass}/${results.length} PASS ====`);
  browser.close(); child.kill();
}
