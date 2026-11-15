// Live Photo 退出/重进补充验证
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:4174';
const SHOTS = path.resolve('.step16-fix1/shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, x = '') => { results.push({ n, p: !!p }); console.log(`${p ? 'PASS' : 'FAIL'} ${n}${x ? ' | ' + x : ''}`); };

const { child, wsUrl } = await launchEdge({ port: 9225 });
const browser = new CDP(wsUrl);
await browser.connect();

async function boot() {
  const page = await newPage(browser, { w: 390, h: 844 });
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon, .launch-screen")', 20000);
  await sleep(300);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 20000);
  return page;
}
const enterCol = async (p) => { await p.clickEl(0); await p.waitFor('!!document.querySelector(".photo-container")', 10000); };
const home = async (p) => { await p.clickSelector('.back-button'); await p.waitFor('!!document.querySelector(".character")', 10000); };
const videoState = (p) => p.evalJS(`(() => { const v = document.querySelector('.photo-container video'); return v ? { paused: v.paused, rs: v.readyState, t: +v.currentTime.toFixed(2), err: v.error && v.error.code } : null; })()`);

try {
  const page = await boot();
  await enterCol(page);
  const p1 = await page.waitFor(`(() => { const v = document.querySelector('.photo-container video'); return v && !v.paused && v.readyState >= 3; })()`, 30000);
  check('Live Photo 首次进入播放', p1, JSON.stringify(await videoState(page)));
  // 播放进度在前进（证明真的在播，不是 paused=false 假象）
  const tA = (await videoState(page)).t;
  await sleep(1500);
  const tB = (await videoState(page)).t;
  check('视频 currentTime 前进', tB > tA, `t ${tA} -> ${tB}`);
  await page.shot('live-first-play', SHOTS);

  // 退出到 home，重新进入
  await home(page);
  await sleep(500);
  const cleaned = await page.evalJS(`document.querySelectorAll('.photo-container video').length`);
  check('离开后视频元素已清理', cleaned === 0, `videos=${cleaned}`);
  await enterCol(page);
  const p2 = await page.waitFor(`(() => { const v = document.querySelector('.photo-container video'); return v && !v.paused && v.readyState >= 3; })()`, 30000);
  const s2 = await videoState(page);
  check('重进后 Live Photo 恢复播放', p2 && !s2.err, JSON.stringify(s2));
  await page.shot('live-reentry', SHOTS);

  // 快速连续进出 3 次，确认无泄漏/无报错
  for (let i = 0; i < 3; i++) { await home(page); await enterCol(page); await sleep(1200); }
  const vids = await page.evalJS(`document.querySelectorAll('.photo-container video').length`);
  check('多次进出仅一个视频元素', vids === 1, `videos=${vids}`);
  const liveErr = browser.consoleErrors.filter(e => /Collection Live|play failed/i.test(e));
  check('无 Live Photo 播放报错', liveErr.length === 0, JSON.stringify(liveErr.slice(0, 3)));
} catch (e) {
  console.error('FATAL', e);
  results.push({ n: 'FATAL', p: false });
} finally {
  fs.writeFileSync(path.resolve('.step16-fix1/live-results.json'), JSON.stringify(results, null, 2));
  console.log(`==== ${results.filter(r => r.p).length}/${results.length} PASS ====`);
  browser.close(); child.kill();
}
