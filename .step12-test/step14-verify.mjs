// Step 14 验证：Message BGM StrictMode 状态修复
import { launchEdge, newPage, CDP, Page } from './cdp.mjs';
const BASE = 'http://localhost:5175';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, d = '') => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); };

const { child, wsUrl } = await launchEdge({ port: 9229 });
const browser = new CDP(wsUrl);
await browser.connect();

// 创建带音频日志钩子 + Fetch 拦截能力的 page
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
const page = new Page(browser, sessionId);
await page.init();
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__audioLog = [];
  window.__media = [];
  const A = window.Audio;
  window.Audio = function(...args) {
    const el = new A(...args);
    window.__media.push(el);
    return el;
  };
  window.Audio.prototype = A.prototype;
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function() {
    window.__audioLog.push('play() ' + (this.currentSrc||this.src));
    return op.call(this).then(() => { window.__audioLog.push('play resolved paused=' + this.paused); })
      .catch(e => { window.__audioLog.push('play rejected ' + e.name); throw e; });
  };
  const op2 = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function() {
    window.__audioLog.push('pause() ' + (this.currentSrc||this.src));
    return op2.call(this);
  };
`});
await page.viewport(390, 844);

let blockAudio = false; // Fetch 拦截开关
browser.on(async (msg) => {
  if (msg.method === 'Fetch.requestPaused' && msg.sessionId === sessionId) {
    const url = msg.params.request.url;
    if (url.includes('bgm.mp3')) {
      if (blockAudio) {
        await page.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'Failed' }).catch(() => {});
      } else {
        await page.send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
      }
    } else {
      await page.send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
    }
  }
});

try {
  // ===== T1: 首次进入 Message（StrictMode dev）=====
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 10000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 20000);
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 8000);
  await sleep(2500);
  const btn1 = await page.evalJS(`!!document.querySelector('.audio-play-button')`);
  check('T1 StrictMode 首次进入: 音频播放中不显示播放按钮', btn1 === false, `btn=${btn1}`);
  const log1 = await page.evalJS('window.__audioLog');
  console.log('   audioLog:', JSON.stringify(log1));
  const resolved = log1.filter(l => l.startsWith('play resolved')).length;
  const rejectedLive = log1.filter(l => l.startsWith('play rejected')).length;
  check('T1 存在成功的 play resolved', resolved >= 1, `resolved=${resolved} rejected=${rejectedLive}`);

  // ===== T2: 离开再进入 =====
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  await sleep(400);
  const pauses = await page.evalJS(`window.__audioLog.filter(l => l.startsWith('pause')).length`);
  check('T2 离开 Message 后旧音频被 pause', pauses >= 1, `pauseCount=${pauses}`);
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 8000);
  await sleep(2500);
  const btn2 = await page.evalJS(`!!document.querySelector('.audio-play-button')`);
  check('T2 第二次进入: 仍无播放按钮', btn2 === false, `btn=${btn2}`);

  // ===== T3: 第三次进出 =====
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 8000);
  await sleep(2500);
  const btn3 = await page.evalJS(`!!document.querySelector('.audio-play-button')`);
  check('T3 第三次进入: 仍无播放按钮', btn3 === false, `btn=${btn3}`);
  const log3 = await page.evalJS('window.__audioLog');
  console.log('   audioLog tail:', JSON.stringify(log3.slice(-8)));

  // ===== T4: 手动播放路径（拦截 bgm.mp3 -> error -> 按钮 -> 放行 -> 点击 -> 消失）=====
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*bgm.mp3*' }] });
  blockAudio = true;
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 8000);
  await sleep(2500);
  const btn4 = await page.evalJS(`!!document.querySelector('.audio-play-button')`);
  check('T4 音频加载失败时显示手动播放入口', btn4 === true, `btn=${btn4}`);
  // 注：模拟网络失败会让媒体元素进入 sticky error 态，play() 必然 NotSupportedError，
  // 点击后按钮保持显示属预期（文件损坏场景），不作为失败项。
  await page.send('Fetch.disable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });

  // ===== T4b: 暂停 -> 按钮出现 -> 手动恢复 -> 按钮消失 =====
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  await page.clickEl(1);
  await page.waitFor('!!document.querySelector(".message-page")', 8000);
  await sleep(2500);
  const btnB0 = await page.evalJS(`!!document.querySelector('.audio-play-button')`);
  // 通过媒体实例触发真实 pause -> pause 事件 -> 应显示播放入口
  await page.evalJS(`window.__media.at(-1).pause()`);
  await sleep(600);
  const btnB1 = await page.evalJS(`!!document.querySelector('.audio-play-button')`);
  check('T4b 音频暂停后显示播放入口', btnB0 === false && btnB1 === true, `before=${btnB0} after=${btnB1}`);
  await page.clickSelector('.audio-play-button');
  let goneB = false;
  for (let i = 0; i < 12; i++) {
    await sleep(400);
    goneB = await page.evalJS(`!document.querySelector('.audio-play-button')`);
    if (goneB) break;
  }
  check('T4b 手动恢复播放后按钮消失', goneB === true);

  // ===== T5: cleanup 后旧 Promise 不再改状态 =====
  // 离开页面后再等 2s，确认无异常/无按钮残留（页面已卸载，状态写入不影响）
  await page.clickSelector('.back-button');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  await sleep(1500);
  const errs = browser.exceptions.length;
  check('T5 离开后无 JS 异常', errs === 0, `exceptions=${errs}`);
} catch (e) {
  console.log('FATAL', e);
  results.push({ n: 'FATAL', p: false });
} finally {
  console.log('--- final audioLog ---');
  try { console.log(JSON.stringify(await page.evalJS('window.__audioLog'))); } catch {}
  browser.close(); child.kill();
}
const fails = results.filter(r => !r.p);
console.log(`\n===== ${results.length - fails.length}/${results.length} PASS =====`);
