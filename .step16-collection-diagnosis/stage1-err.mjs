// 阶段1补充验证：图片 error 放行队列（不死锁）
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import path from 'node:path';
import fs from 'node:fs';

const BASE = 'http://localhost:4174';
const OUT = path.resolve('.step16-collection-diagnosis');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, d = '') => { results.push({ n, p: !!p }); console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? ' | ' + d : ''}`); };

const { child, wsUrl } = await launchEdge({ port: 9263 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
await page.send('Network.enable');
await page.send('Network.setCacheDisabled', { cacheDisabled: true });
// 阻断 photo3.webp → 模拟 error
await page.send('Network.setBlockedURLs', { urls: ['*photo3.webp*'] });

try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 60000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 30000);
  await page.evalJS('localStorage.clear()');
  await page.evalJS(`(() => { const els=[...document.querySelectorAll('a,button,div,span')].filter(e=>e.children.length===0 && /收藏/.test(e.textContent)); if(els.length)(els[0].closest('a,button,div[class]')||els[0]).click(); })()`);
  await page.waitFor('!!document.querySelector(".photo-container")', 20000);
  await sleep(2500);

  // 当前=0(photo1 live)。向前滑两次到 index2=photo3.webp（被阻断）
  await page.swipeOn('.photo-container', 0.8, 0.2, 0.5); await sleep(800);
  await page.swipeOn('.photo-container', 0.8, 0.2, 0.5); await sleep(3000);

  // photo3 请求被阻断 → error → 队列应放行：photo4 与 photo2 邻卡应已获得 src
  const st = await page.evalJS(`(() => {
    const cards=[...document.querySelectorAll('.photo-card')];
    const srcOf = i => { const img=cards[i] && cards[i].querySelector('.media-container img'); return img ? (img.getAttribute('src')||'none') : 'nocard'; };
    return { p1:srcOf(1), p2:srcOf(2), p3:srcOf(3), p4:srcOf(4) };
  })()`);
  console.log('IMG_SRCS', JSON.stringify(st));
  check('E1 photo3 作为当前卡已发起(src已设置)', st.p2.includes('photo3.webp'), st.p2);
  check('E2 error 后邻卡 photo4 已放行', st.p3.includes('photo4.webp'), st.p3);
  check('E3 error 后邻卡 photo2 已放行', st.p1.includes('photo2.webp'), st.p1);

  // 再滑到 index3(photo4) 验证页面仍可继续导航（无死锁）
  await page.swipeOn('.photo-container', 0.8, 0.2, 0.5); await sleep(1500);
  const cur = await page.evalJS(`(() => { const cards=[...document.querySelectorAll('.photo-card')]; return cards.findIndex(c=>getComputedStyle(c).opacity==='1') })()`);
  check('E4 队列恢复后仍可滑动', cur === 3, `idx=${cur}`);

  fs.writeFileSync(path.join(OUT, 'stage1-err-results.json'), JSON.stringify(results, null, 2));
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
  results.push({ n: 'FATAL', p: false });
} finally {
  const pass = results.filter(r => r.p).length;
  console.log(`==== STAGE1-ERR ${pass}/${results.length} PASS ====`);
  browser.close(); child.kill();
}
