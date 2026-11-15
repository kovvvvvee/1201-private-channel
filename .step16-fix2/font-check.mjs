// 字体闪变专项验证：记录 woff2 资源 timing vs 信纸出现时间
import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
const BASE = process.argv[2] || 'http://localhost:4174';
const LABEL = process.argv[3] || 'local';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { child, wsUrl } = await launchEdge({ port: 9234 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
await page.send('Network.enable');
await page.send('Network.setCacheDisabled', { cacheDisabled: true });
const t0 = Date.now();
const rel = () => +((Date.now() - t0) / 1000).toFixed(2);
try {
  await page.navigate(BASE + '/');
  await sleep(2500);
  if (await page.evalJS(`document.title.includes('Caution')`)) { await page.evalJS('access()'); await sleep(4000); }
  await page.waitFor('!!document.querySelector(".start-icon")', 120000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 60000);
  await page.clickEl(1); // message
  await page.waitFor('!!document.querySelector(".message-page")', 20000);
  await page.waitFor('!!document.querySelector(".envelope-container.visible .envelope-image")', 60000);
  const envT = rel();
  console.log(`[${rel()}s] envelope visible`);
  await page.clickSelector('.envelope-container');
  // 高频轮询信纸出现
  let letterPerfNow = null;
  for (let i = 0; i < 400; i++) {
    const vis = await page.evalJS(`(() => { const l = document.querySelector('.letter-container.visible .letter-text'); return l ? performance.now() : null; })()`);
    if (vis !== null) { letterPerfNow = vis; break; }
    await sleep(50);
  }
  console.log(`[${rel()}s] letter visible, perfNow=${letterPerfNow}`);
  await sleep(500);
  const fontEntry = await page.evalJS(`(() => {
    const e = performance.getEntriesByName('/fonts/mashan-zhen-subset.woff2')[0] ||
              performance.getEntriesByType('resource').find(r => r.name.includes('mashan'));
    return e ? { start: e.startTime, end: e.responseEnd, size: e.transferSize, decoded: e.decodedBodySize } : null;
  })()`);
  const fontCheck = await page.evalJS(`document.fonts.check('16px "Ma Shan Zheng"')`);
  console.log('FONT_ENTRY:', JSON.stringify(fontEntry), 'fontCheck=', fontCheck);
  console.log(`SUMMARY ${LABEL}: envelopeAt=${envT}s letterPerfNow=${letterPerfNow} fontStart=${fontEntry && fontEntry.start.toFixed(0)}ms fontEnd=${fontEntry && fontEntry.end.toFixed(0)}ms`);
  // 判断：字体请求开始时间是否早于信纸出现（预加载生效→无闪变）
  if (fontEntry && letterPerfNow !== null) {
    const preloaded = fontEntry.start < letterPerfNow - 500;
    console.log(preloaded ? 'FONT_PRELOADED_BEFORE_LETTER=YES (无闪变)' : 'FONT_LOADED_ON_LETTER_OPEN (可能闪变)');
  }
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); }
finally { browser.close(); child.kill(); }
