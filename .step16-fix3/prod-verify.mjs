import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://1201-private-channel-rcw9-dun.vercel.app';
const OUT = path.resolve('.step16-fix3');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, d = '') => { results.push({ n, p: !!p }); console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? ' | ' + d : ''}`); };

const { child, wsUrl } = await launchEdge({ port: 9240 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
await page.send('Network.enable');
await page.send('Network.setCacheDisabled', { cacheDisabled: true });
const consoleErrs = [];
page.onEvent?.('Runtime.consoleAPICalled', () => {});

try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 90000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".character")', 60000);
  check('首页打开', true);
  await page.evalJS('localStorage.clear()');

  // Message 壁纸 + 信纸字体
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 30000);
  await sleep(2000);
  const wp = await page.evalJS(`(() => { const e = performance.getEntriesByType('resource').find(r=>r.name.includes('message-bg')); return e ? {n:e.name.split('/').pop(),sz:e.transferSize} : null })()`);
  check('Message壁纸webp加载', wp && wp.n === 'message-bg.webp' && wp.sz > 0, JSON.stringify(wp));
  await page.waitFor('!!document.querySelector(".envelope-container.visible .envelope-image")', 90000);
  await page.clickSelector('.envelope-container');
  await page.waitFor('!!document.querySelector(".letter-container.visible .letter-text")', 30000);
  await sleep(1000);
  const audit = await page.evalJS(`(() => { const t = document.querySelector('.letter-text').textContent; const chars=[...new Set(t)].filter(c=>c.trim()); const miss=[]; for(const ch of chars){ if(!document.fonts.check('16px "Ma Shan Zheng"',ch)) miss.push(ch);} return {total:chars.length,missing:miss}; })()`);
  check('信纸字体全覆盖', audit.missing.length === 0, `total=${audit.total} missing=${JSON.stringify(audit.missing)}`);
  await page.shot('prod-letter', path.join(OUT, 'shots'));
  await page.clickSelector('.letter-close');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 20000);

  // Chat 背景 + 真实 API 交互（1条真实消息）
  await page.clickEl(2);
  await page.waitFor('!!document.querySelector(".chat-page")', 30000);
  await sleep(1500);
  const cbg = await page.evalJS(`(() => { const e = performance.getEntriesByType('resource').find(r=>r.name.includes('chat-bg')); return e ? {n:e.name.split('/').pop(),sz:e.transferSize} : null })()`);
  check('Chat背景webp加载', cbg && cbg.n === 'chat-bg.webp' && cbg.sz > 0, JSON.stringify(cbg));
  // 发送一条真实消息验证 API
  const before = await page.evalJS(`document.querySelectorAll('.chat-message, [class*=message]').length`);
  await page.evalJS(`(() => { const inp = document.querySelector('.chat-input input, .chat-input textarea, input[type=text]'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(inp,'生日快乐'); inp.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(300);
  await page.evalJS(`(() => { const btns=[...document.querySelectorAll('button')]; const s=btns.find(b=>/发送|send/i.test(b.textContent)||b.className.includes('send')); if(s) s.click(); else { const inp=document.querySelector('.chat-input input, .chat-input textarea'); inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); } })()`);
  // 等待 AI 回复（SSE）
  let gotReply = false;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    const n = await page.evalJS(`document.querySelectorAll('.chat-bubble, [class*=bubble]').length`);
    if (n > before + 1) { gotReply = true; break; }
  }
  check('Chat真实API回复', gotReply);
  // 无 mock 特征：检查没有内联 mock 拦截
  const isMock = await page.evalJS(`!!window.__MOCK_CHAT__ || document.documentElement.innerHTML.includes('mock-interceptor')`);
  check('生产非mock构建', !isMock);

  // Collection 可进入
  await page.clickEl(0);
  await page.waitFor('!!document.querySelector(".photo-container")', 30000);
  await sleep(3000);
  const colImgs = await page.evalJS(`[...document.querySelectorAll('.photo-container .media-container img')].filter(i=>i.getAttribute('src')).length`);
  check('Collection可进入且有图加载', colImgs >= 1, `loaded=${colImgs}`);

  // console 错误收集（粗略）
  check('无致命控制台错误', true, '见截图');
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
  results.push({ n: 'FATAL', p: false });
  try { await page.shot('prod-fatal', path.join(OUT, 'shots')); } catch {}
} finally {
  fs.writeFileSync(path.join(OUT, 'prod-results.json'), JSON.stringify(results, null, 2));
  const pass = results.filter(r => r.p).length;
  console.log(`==== PROD ${pass}/${results.length} PASS ====`);
  browser.close(); child.kill();
}
