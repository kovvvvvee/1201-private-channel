import { launchEdge, newPage, CDP } from './cdp.mjs';
const BASE = 'http://localhost:5175';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { child, wsUrl } = await launchEdge({ port: 9224 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
page.b.on((msg) => {
  if (msg.method === 'Runtime.consoleAPICalled') {
    console.log('CON[' + msg.params.type + ']:', msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    console.log('EXC:', JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
  }
});
try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 10000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 20000);
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 8000);
  await sleep(1500);
  const btn = await page.evalJS(`!!document.querySelector('.audio-play-button')`);
  console.log('play button present:', btn);
  // 手动 click（DOM click）
  await page.evalJS(`document.querySelector('.audio-play-button')?.click()`);
  for (let i = 0; i < 8; i++) {
    await sleep(500);
    const st = await page.evalJS(`({
      btn: !!document.querySelector('.audio-play-button'),
      media: [...document.querySelectorAll('audio,video')].length,
    })`);
    console.log(i, JSON.stringify(st));
    if (!st.btn) break;
  }
  // 对比：自己 new Audio 测试 play()
  const own = await page.evalJS(`(async () => {
    const a = new Audio('/audio/bgm.mp3');
    try { await a.play(); return 'played paused=' + a.paused; }
    catch (e) { return 'rejected: ' + e.name + ' ' + e.message; }
  })()`);
  console.log('own audio test:', own);
} finally {
  browser.close(); child.kill();
}
