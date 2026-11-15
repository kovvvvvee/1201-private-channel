import { launchEdge, newPage, CDP } from './cdp.mjs';
const BASE = 'https://sheyh-36-28-220-14.run.pinggy-free.link';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { child, wsUrl } = await launchEdge({ port: 9235 });
const b = new CDP(wsUrl); await b.connect();
const p = await newPage(b, { w: 375, h: 667 });
try {
  await p.navigate(BASE + '/');
  await sleep(3000);
  if (await p.evalJS(`document.title.includes('Caution')`)) {
    await p.evalJS('access()'); await sleep(10000);
  }
  const ok = await p.waitFor('!!document.querySelector(".start-icon")', 90000);
  console.log('start-icon:', ok);
  await p.clickSelector('.start-icon');
  await p.waitFor('!!document.querySelector(".bottom-nav")', 60000);
  await sleep(1000);
  const nav = await p.evalJS(`(() => {
    const btns = [...document.querySelectorAll('.nav-button')];
    return { n: btns.length, fit: btns.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  })()`);
  console.log('375px home:', JSON.stringify(nav));
  await p.shot('tunnel-375-home', '.step12-test/shots');
  await p.clickEl(2);
  await p.waitFor('!!document.querySelector(".chat-page")', 30000);
  await sleep(500);
  const inp = await p.evalJS(`(() => { const r = document.querySelector('.chat-input').getBoundingClientRect(); return { visible: r.bottom <= innerHeight && r.top >= 0, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
  console.log('375px chat:', JSON.stringify(inp));
  await p.shot('tunnel-375-chat', '.step12-test/shots');
} finally { b.close(); child.kill(); }
