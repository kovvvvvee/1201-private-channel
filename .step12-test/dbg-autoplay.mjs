import { launchEdge, newPage, CDP } from './cdp.mjs';
const BASE = 'http://localhost:5175';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// autoplay 允许 -> 验证 BGM 直接播放、不出现手动按钮
const { child, wsUrl } = await launchEdge({
  port: 9226,
  extraArgs: ['--autoplay-policy=no-user-gesture-required'],
});
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 10000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 20000);
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 8000);
  await sleep(2500);
  const st = await page.evalJS(`({
    btn: !!document.querySelector('.audio-play-button'),
    envelopeSoon: !!document.querySelector('.envelope-container')
  })`);
  console.log('autoplay-allowed state:', JSON.stringify(st));
  console.log(st.btn === false ? 'PASS autoplay: 无手动按钮(直接播放)' : 'CHECK: 按钮仍出现');
} finally {
  browser.close(); child.kill();
}
