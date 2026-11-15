// Vercel 图片响应头/状态码抓取：冷缓存 vs 热缓存
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://1201-private-channel-rcw9-dun.vercel.app';
const OUT = path.resolve('.step16-collection-diagnosis');
const PORT = +(process.argv[2] || 9260);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { child, wsUrl } = await launchEdge({ port: PORT });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
await page.send('Network.enable');
await page.send('Network.setCacheDisabled', { cacheDisabled: true }); // 冷缓存

const netLog = [];
const reqMap = new Map();
browser.on(async (msg) => {
  if (msg.method === 'Network.requestWillBeSent') {
    const u = msg.params.request.url;
    if (/photos|chibi/.test(u)) reqMap.set(msg.params.requestId, { url: u, t: Date.now() });
  }
  if (msg.method === 'Network.responseReceived') {
    const u = msg.params.response.url;
    if (/photos|chibi/.test(u)) {
      const h = msg.params.response.headers;
      netLog.push({
        url: u.split('/').pop(), status: msg.params.response.status,
        cacheControl: h['cache-control'] || h['Cache-Control'],
        etag: h['etag'] || h['ETag'],
        age: h['age'] || h['Age'],
        xvercelcache: h['x-vercel-cache'] || h['X-Vercel-Cache'],
        contentLength: h['content-length'] || h['Content-Length'],
        contentType: h['content-type'] || h['Content-Type'],
        fromDiskCache: msg.params.response.fromDiskCache,
        fromServiceWorker: msg.params.response.fromServiceWorker,
      });
    }
  }
});

const enterCollection = async () => {
  await page.evalJS(`(() => { const els=[...document.querySelectorAll('a,button,div,span')].filter(e=>e.children.length===0 && /收藏/.test(e.textContent)); if(els.length)(els[0].closest('a,button,div[class]')||els[0]).click(); })()`);
  await page.waitFor('!!document.querySelector(".photo-container")', 30000);
  await sleep(6000); // 等所有首窗资源完成
};

try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 90000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 60000);
  await page.evalJS('localStorage.clear()');

  // ===== 冷缓存 =====
  netLog.length = 0;
  await enterCollection();
  const cold = [...netLog];
  fs.writeFileSync(path.join(OUT, 'netlog-prod-cold.json'), JSON.stringify(cold, null, 1));
  console.log('COLD', JSON.stringify(cold, null, 1));

  // 离开再进（同 session，HTTP 缓存生效）→ 第二次进入
  await page.evalJS(`document.querySelector('.back-button')?.click()`);
  await sleep(1500);
  netLog.length = 0;
  await enterCollection();
  const warm1 = [...netLog];
  fs.writeFileSync(path.join(OUT, 'netlog-prod-warm1.json'), JSON.stringify(warm1, null, 1));
  console.log('WARM1', JSON.stringify(warm1, null, 1));

  // 第三次进入
  await page.evalJS(`document.querySelector('.back-button')?.click()`);
  await sleep(1500);
  netLog.length = 0;
  await enterCollection();
  const warm2 = [...netLog];
  console.log('WARM2', JSON.stringify(warm2, null, 1));

  // 传输字节：performance entries 对比
  const bytes = await page.evalJS(`performance.getEntriesByType('resource').filter(r=>/photos|chibi/.test(r.name)).map(r=>({n:r.name.split('/').pop(),ts:r.transferSize,ds:r.decodedBodySize,st:r.responseStatus}))`);
  console.log('BYTES', JSON.stringify(bytes));
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
} finally {
  browser.close(); child.kill();
}
