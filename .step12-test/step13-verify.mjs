// Step 13 验证：Chat 请求失败后额度恢复修复
import { launchEdge, newPage, CDP } from './cdp.mjs';

const BASE = 'http://localhost:5175';
const MOCK = 'http://localhost:3001';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, p, d = '') => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); };

const mock = async (m) => fetch(`${MOCK}/__set?mode=${m}`);

async function seed(page, remain) {
  const state = { channelId: '1201', remainCount: remain, closed: false, endingTriggered: false, messages: [] };
  await page.evalJS(`localStorage.setItem('private_channel_1201', ${JSON.stringify(JSON.stringify(state))})`);
}
async function remountChat(page) {
  await page.evalJS(`(() => { const b = document.querySelector('.back-btn'); if (b) b.click(); })()`);
  await page.waitFor('!!document.querySelector(".bottom-nav")', 8000);
  await page.clickEl(2);
  await page.waitFor('!!document.querySelector(".chat-page")', 8000);
  await sleep(300);
}
const badge = (page) => page.evalJS(`document.querySelector('.remaining-badge')?.textContent?.trim()`);
const stored = (page) => page.evalJS(`JSON.parse(localStorage.getItem('private_channel_1201')).remainCount`);
const errBubble = (page) => page.evalJS(`document.body.textContent.includes('通讯信号不稳定')`);
const inputVal = (page) => page.evalJS(`document.querySelector('.chat-input')?.value`);
const send = async (page, text) => {
  await page.typeInto('.chat-input', text);
  await page.clickSelector('.send-button');
};
const waitIdle = async (page, timeout = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const loading = await page.evalJS(`(() => {
      const b = document.querySelector('.send-button');
      return b ? b.disabled || b.textContent.includes('发送中') : false;
    })()`);
    if (!loading) return true;
    await sleep(250);
  }
  return false;
};

const { child, wsUrl } = await launchEdge({ port: 9228 });
const browser = new CDP(wsUrl);
await browser.connect();
const page = await newPage(browser, { w: 390, h: 844 });
try {
  await page.navigate(BASE + '/');
  await page.waitFor('!!document.querySelector(".start-icon")', 10000);
  await page.clickSelector('.start-icon');
  await page.waitFor('!!document.querySelector(".bottom-nav")', 20000);

  // ===== 场景1：成功请求 8 -> 7 =====
  await mock('ok');
  await seed(page, 8);
  await remountChat(page);
  check('S1 初始 badge=8', (await badge(page))?.includes('8') === true, await badge(page));
  await send(page, '成功测试');
  await waitIdle(page);
  await sleep(4000); // 等 AI 逐条回复结束
  check('S1 成功后 badge=7', (await badge(page))?.includes('7') === true, await badge(page));
  check('S1 storage remainCount=7', (await stored(page)) === 7, String(await stored(page)));

  // ===== 场景2：失败一次 8 -> 8 =====
  await mock('fail');
  await seed(page, 8);
  await remountChat(page);
  await send(page, '失败测试');
  await waitIdle(page);
  await sleep(800);
  check('S2 失败后 badge=8', (await badge(page))?.includes('8') === true, await badge(page));
  check('S2 storage remainCount=8', (await stored(page)) === 8, String(await stored(page)));
  check('S2 错误提示显示', await errBubble(page));
  check('S2 输入框恢复原文', (await inputVal(page)) === '失败测试', await inputVal(page));

  // ===== 场景3：连续两次失败仍为 8 =====
  // 输入框已恢复文本，直接再次点击发送（不重新输入）
  await page.clickSelector('.send-button');
  await waitIdle(page);
  await sleep(800);
  check('S3 连续第二次失败 badge 仍=8', (await badge(page))?.includes('8') === true, await badge(page));
  check('S3 storage 仍=8', (await stored(page)) === 8, String(await stored(page)));
  check('S3 输入框仍恢复', (await inputVal(page)) === '失败测试', await inputVal(page));

  // ===== 场景4：失败后成功 8 -> 7 =====
  await mock('ok');
  await page.clickSelector('.send-button'); // 发送恢复的"失败测试"
  await waitIdle(page);
  await sleep(4000);
  check('S4 失败后成功 badge=7', (await badge(page))?.includes('7') === true, await badge(page));
  check('S4 storage=7', (await stored(page)) === 7, String(await stored(page)));

  // ===== 场景5：loading/防重回归 =====
  await mock('ok');
  await page.typeInto('.chat-input', '回归测试');
  await page.clickSelector('.send-button');
  await sleep(250); // mock 前 600ms 无响应，处于 loading
  const loadingState = await page.evalJS(`(() => {
    const b = document.querySelector('.send-button');
    return { disabled: b?.disabled, text: b?.textContent, typing: document.body.textContent.includes('正在输入') };
  })()`);
  check('S5 loading 状态正常', loadingState.disabled === true && loadingState.typing === true, JSON.stringify(loadingState));
  await page.clickSelector('.send-button').catch(() => {});
  await sleep(300);
  const userCount = await page.evalJS(`[...document.querySelectorAll('.chat-area .message.user')]
    .filter(m => m.textContent.trim() === '回归测试').length`);
  check('S5 连点只发一次', userCount === 1, `回归测试气泡=${userCount}`);
  await waitIdle(page);
  await sleep(4000);

  // ===== storage 结构兼容 =====
  const keys = await page.evalJS(`Object.keys(JSON.parse(localStorage.getItem('private_channel_1201')))`);
  check('S6 storage 结构兼容', ['channelId','remainCount','closed','endingTriggered','messages'].every(k => keys.includes(k)), keys.join(','));
} catch (e) {
  console.log('FATAL', e);
  results.push({ n: 'FATAL', p: false });
} finally {
  browser.close(); child.kill();
}
const fails = results.filter(r => !r.p);
console.log(`\n===== ${results.length - fails.length}/${results.length} PASS =====`);
