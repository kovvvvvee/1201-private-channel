import { launchEdge, newPage, CDP } from './cdp.mjs';
const BASE = 'http://localhost:5175';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { child, wsUrl } = await launchEdge({ port: 9225 });
const browser = new CDP(wsUrl);
await browser.connect();
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
const page = new (await import('./cdp.mjs')).Page(browser, sessionId);
await page.init();
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__audioLog = [];
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function() {
    const el = this;
    window.__audioLog.push('play() called src=' + (el.currentSrc || el.src));
    return origPlay.call(this).then(() => {
      window.__audioLog.push('play resolved paused=' + el.paused);
      return undefined;
    }).catch(e => {
      window.__audioLog.push('play rejected: ' + e.name);
      throw e;
    });
  };
  const origPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function() {
    window.__audioLog.push('pause() called src=' + (this.currentSrc || this.src));
    return origPause.call(this);
  };
`});
await page.viewport(390, 844);
try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 10000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 20000);
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 8000);
  await sleep(2000);
  console.log('--- audio log after mount ---');
  console.log((await page.evalJS('window.__audioLog')).join('\n'));
  console.log('btn present:', await page.evalJS(`!!document.querySelector('.audio-play-button')`));
  // 真实鼠标点击
  await page.clickSelector('.audio-play-button');
  await sleep(2500);
  console.log('--- audio log after click ---');
  console.log((await page.evalJS('window.__audioLog')).join('\n'));
  console.log('btn present after click:', await page.evalJS(`!!document.querySelector('.audio-play-button')`));
  // 离开页面 -> cleanup 应 pause
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  await sleep(500);
  console.log('--- audio log after leaving message ---');
  console.log((await page.evalJS('window.__audioLog')).join('\n'));
} finally {
  browser.close(); child.kill();
}
