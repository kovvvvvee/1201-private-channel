// Collection 专项诊断：图片四阶段 + Live Photo 全状态
// 用法: node diag.mjs <baseUrl> <label> [port] [warm]
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2];
const LABEL = process.argv[3] || 'run';
const PORT = +(process.argv[4] || 9250);
const WARM = process.argv[5] === 'warm';
const OUT = path.resolve('.step16-collection-diagnosis');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const snap = [];

const { child, wsUrl } = await launchEdge({ port: PORT });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
await page.send('Network.enable');
if (!WARM) await page.send('Network.setCacheDisabled', { cacheDisabled: true });

const clickCollection = async () => {
  const ok = await page.evalJS(`(() => { const els=[...document.querySelectorAll('a,button,div,span')].filter(e=>e.children.length===0 && /收藏/.test(e.textContent)); if(els.length){(els[0].closest('a,button,div[class]')||els[0]).click();return true} return false })()`);
  return ok;
};

const collectSnap = async (tag) => {
  const s = await page.evalJS(`(() => {
    const imgs = [...document.querySelectorAll('.photo-container .media-container img')].map(i => ({
      src: i.getAttribute('src') || null, ds: i.dataset.src || null,
      complete: i.complete, nw: i.naturalWidth,
      vis: (() => { const c = i.closest('.photo-card'); return c ? getComputedStyle(c).opacity : null; })(),
    }));
    const vids = [...document.querySelectorAll('.photo-container video')].map(v => ({
      src: v.currentSrc || v.src, rs: v.readyState, ns: v.networkState,
      paused: v.paused, ct: +v.currentTime.toFixed(2),
      err: v.error ? v.error.code : null,
      muted: v.muted, dm: v.defaultMuted, hasMutedAttr: v.hasAttribute('muted'),
      hasPI: v.hasAttribute('playsinline'), pi: v.playsInline,
    }));
    return { imgs, vids };
  })()`);
  snap.push({ tag, t: Date.now(), ...s });
  return s;
};

try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 90000);
  if (await page.evalJS(`document.title.includes('Caution')`)) { await page.evalJS('access()'); await sleep(3000); }
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 60000);
  await page.evalJS('localStorage.clear()');

  const enterT = Date.now();
  const clicked = await clickCollection();
  console.log('enterCollection click=', clicked);
  await page.waitFor('!!document.querySelector(".photo-container")', 30000);
  const mountedAt = Date.now() - enterT;
  console.log('photo-container mounted at', mountedAt, 'ms');

  // 采样 14s
  for (let i = 0; i < 28; i++) {
    await sleep(500);
    await collectSnap('t' + ((Date.now() - enterT) / 1000).toFixed(1));
  }

  // 资源 timing
  const res = await page.evalJS(`performance.getEntriesByType('resource').filter(r=>/photos|chibi/.test(r.name)).map(r=>({n:r.name.split('/').pop(),s:+r.startTime.toFixed(0),e:+r.responseEnd.toFixed(0),sz:r.transferSize,dsz:r.decodedBodySize,st:r.responseStatus}))`);
  fs.writeFileSync(path.join(OUT, `res-${LABEL}.json`), JSON.stringify(res, null, 1));
  console.log('RES', JSON.stringify(res));

  // 响应头检查（cache-control 对非指纹资源很关键）
  const hdrs = await page.evalJS(`fetch('/photos/photo2.webp',{method:'GET'}).then(r=>({cc:r.headers.get('cache-control'),age:r.headers.get('age'),server:r.headers.get('server'),type:r.headers.get('content-type')})).catch(e=>String(e))`);
  console.log('HEADERS', JSON.stringify(hdrs));

  // 图片 decode 实测
  const dec = await page.evalJS(`(async () => {
    const out = [];
    for (const i of document.querySelectorAll('.photo-container .media-container img')) {
      if (i.getAttribute('src')) { const t = performance.now(); try { await i.decode(); out.push({src:i.getAttribute('src'),ms:+(performance.now()-t).toFixed(1)}); } catch(e){ out.push({src:i.getAttribute('src'),err:String(e)}); } }
    }
    return out;
  })()`);
  console.log('DECODE', JSON.stringify(dec));

  // 视频深潜
  const vids = await page.evalJS(`(() => [...document.querySelectorAll('.photo-container video')].map(v=>({src:v.currentSrc||v.src,rs:v.readyState,ns:v.networkState,paused:v.paused,ct:v.currentTime,err:v.error&&v.error.code,dur:v.duration})))()`);
  console.log('VIDS', JSON.stringify(vids));

  // 手动 play() 结果
  if (vids.length) {
    const playRes = await page.evalJS(`(async () => { const v = document.querySelector('.photo-container video'); if(!v) return null; const t=performance.now(); try { await v.play(); return {ok:true,ms:+(performance.now()-t).toFixed(0),ct:v.currentTime,rs:v.readyState}; } catch(e){ return {ok:false,err:String(e),ct:v.currentTime,rs:v.readyState,errCode:v.error&&v.error.code}; } })()`);
    console.log('PLAY_MANUAL', JSON.stringify(playRes));
    await sleep(1500);
    const afterPlay = await page.evalJS(`(() => { const v=document.querySelector('.photo-container video'); return v?{paused:v.paused,ct:v.currentTime,rs:v.readyState}:null })()`);
    console.log('AFTER_PLAY', JSON.stringify(afterPlay));
  }

  // 触摸兜底测试（当前 live 卡）
  await page.swipeOn('.photo-container', 0.7, 0.75, 0.5); // 小幅度不触发切换但产生 touchstart
  await sleep(800);
  const touchState = await page.evalJS(`(() => [...document.querySelectorAll('.photo-container video')].map(v=>({paused:v.paused,ct:+v.currentTime.toFixed(2)})))()`);
  console.log('AFTER_TOUCH', JSON.stringify(touchState));

  // 滑动切换到下一张 + 视频切换 + 清理验证
  await page.swipeOn('.photo-container', 0.8, 0.2, 0.5);
  await sleep(2500);
  const afterSwipe = await collectSnap('afterSwipe');
  console.log('SWIPE vids=', JSON.stringify(afterSwipe.vids), 'imgsWithSrc=', afterSwipe.imgs.filter(i=>i.src).length);

  // 离开再进入（同 session 热导航）
  await page.evalJS(`(() => { const b=document.querySelector('.back-button'); if(b) b.click(); })()`);
  await sleep(1500);
  await clickCollection();
  await page.waitFor('!!document.querySelector(".photo-container")', 20000);
  await sleep(4000);
  const reentry = await collectSnap('reentry');
  console.log('REENTRY vids=', JSON.stringify(reentry.vids));

  // 控制台/异常
  console.log('CONSOLE_ERRORS', JSON.stringify(browser.consoleErrors.slice(0, 10)));
  console.log('EXCEPTIONS', JSON.stringify(browser.exceptions.slice(0, 10)));
  await page.shot(`diag-${LABEL}`, path.join(OUT, 'shots'));
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
} finally {
  fs.writeFileSync(path.join(OUT, `snap-${LABEL}.json`), JSON.stringify(snap, null, 1));
  browser.close(); child.kill();
}
