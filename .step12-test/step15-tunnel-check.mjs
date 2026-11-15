// 验证 dist-mock 体验版：mock 聊天 + 页面资源
import { launchEdge, newPage, CDP } from './cdp.mjs';
const BASE = 'https://sheyh-36-28-220-14.run.pinggy-free.link';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, d = '') => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); };

const { child, wsUrl } = await launchEdge({ port: 9230 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
// 记录所有网络请求，检查是否有外部 API
const netLog = [];
browser.on((msg) => {
  if (msg.method === 'Network.requestWillBeSent') netLog.push(msg.params.request.url);
});
try {
  await page.send('Network.enable');
  await page.navigate(BASE + '/');
  await sleep(3000);
  const caution = await page.evalJS(`document.title.includes('Caution')`);
  if (caution) {
    console.log('INFO pinggy interstitial -> access()');
    await page.evalJS('access()');
    await sleep(10000);
  }
  await page.waitFor('!!document.querySelector(".start-icon")', 90000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 60000);
  check('首页进入', true);

  // Home 资源
  const res = await page.evalJS(`performance.getEntriesByType('resource').map(e=>e.name)`);
  check('home-bg.webp 加载', res.some(u => u.includes('home-bg.webp')));
  check('角色 webp 加载', res.some(u => u.includes('xinghui-home.webp')));

  // Collection
  await page.clickEl(0);
  await page.waitFor('!!document.querySelector(".collection-page")', 30000);
  await sleep(1500);
  const cards = await page.evalJS(`document.querySelectorAll('.photo-container .photo-card').length`);
  const vids = await page.evalJS(`[...document.querySelectorAll('.photo-container video')].map(v=>!v.paused)`);
  check('Collection 9卡+live视频播放', cards === 9 && vids.some(Boolean), `cards=${cards} vids=${JSON.stringify(vids)}`);
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 30000);

  // Message
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 30000);
  const env = await page.waitFor('!!document.querySelector(".envelope-container.visible .envelope-image")', 45000);
  check('Message 信封显示', env === true);
  await page.clickSelector('.envelope-container');
  await page.waitFor('!!document.querySelector(".letter-container.visible")', 20000);
  const letterOk = await page.evalJS(`document.querySelector('.letter-text')?.textContent?.length > 100`);
  check('Message 信纸内容', letterOk === true);
  await page.clickSelector('.letter-close');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 30000);

  // Chat mock
  await page.clickEl(2);
  await page.waitFor('!!document.querySelector(".chat-page")', 30000);
  const badge0 = await page.evalJS(`document.querySelector('.remaining-badge')?.textContent`);
  check('Chat 进入 badge=12', badge0?.includes('12') === true, badge0);
  await page.evalJS(`(() => {
    const el = document.querySelector('.chat-input'); el.focus();
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    s.call(el,'你好'); el.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await page.clickSelector('.send-button');
  await sleep(300);
  const loading = await page.evalJS(`document.body.textContent.includes('正在输入')`);
  check('Chat loading 状态', loading === true);
  const t0 = Date.now();
  let replied = false;
  while (Date.now() - t0 < 10000) {
    const n = await page.evalJS(`document.querySelectorAll('.chat-area .message.ai .message-bubble').length`);
    if (n >= 3) { replied = true; break; }
    await sleep(300);
  }
  check('Chat mock 回复逐条到达', replied === true);
  const badge1 = await page.evalJS(`document.querySelector('.remaining-badge')?.textContent`);
  check('Chat 次数 12->11', badge1?.includes('11') === true, badge1);

  // mock 错误注入：消息含「失败」-> 500 -> 错误气泡 + 输入恢复
  await page.evalJS(`(() => {
    const el = document.querySelector('.chat-input'); el.focus();
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    s.call(el,'触发失败测试'); el.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await page.clickSelector('.send-button');
  await sleep(2500);
  const err = await page.evalJS(`document.body.textContent.includes('通讯信号不稳定')`);
  const inp = await page.evalJS(`document.querySelector('.chat-input')?.value`);
  check('Chat mock 500 错误提示+输入恢复', err === true && inp === '触发失败测试', `err=${err} input=${inp}`);

  // 刷新页面
  await page.send('Page.reload');
  await page.waitFor('document.readyState === "complete"', 40000);
  await page.waitFor('!!document.querySelector(".start-icon")', 40000);
  check('刷新后回到 Launch', true);

  // 网络安全检查
  const ext = netLog.filter(u => /deepseek|api\.deepseek|openai/i.test(u));
  const apiCalls = netLog.filter(u => u.includes('/api/'));
  check('无真实 API 请求', ext.length === 0 && apiCalls.length === 0, `apiCalls=${JSON.stringify(apiCalls)} ext=${ext.length}`);
  console.log('   netLog sample:', netLog.slice(0, 12).join(' | '));
} catch (e) {
  console.log('FATAL', e);
  results.push({ n: 'FATAL', p: false });
} finally {
  browser.close(); child.kill();
}
const fails = results.filter(r => !r.p);
console.log(`\n===== ${results.length - fails.length}/${results.length} PASS =====`);
