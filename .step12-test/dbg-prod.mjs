import { launchEdge, newPage, CDP } from './cdp.mjs';
const BASE = 'http://localhost:4173';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { child, wsUrl } = await launchEdge({
  port: 9227,
  extraArgs: process.env.BLOCK_AUTOPLAY ? ['--autoplay-policy=user-gesture-required'] : [],
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
  const btn1 = await page.evalJS(`!!document.querySelector('.audio-play-button')`);
  console.log('prod: play button after mount =', btn1);
  if (btn1) {
    await page.clickSelector('.audio-play-button');
    let gone = false;
    for (let i = 0; i < 10; i++) {
      await sleep(400);
      gone = await page.evalJS(`!document.querySelector('.audio-play-button')`);
      if (gone) break;
    }
    console.log('prod: button gone after click =', gone);
  }
} finally {
  browser.close(); child.kill();
}
