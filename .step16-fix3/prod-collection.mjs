import { launchEdge, newPage, CDP } from '../.step12-test/cdp.mjs';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { child, wsUrl } = await launchEdge({ port: 9241 });
const b = new CDP(wsUrl); await b.connect();
const p = await newPage(b, { w: 390, h: 844 });
await p.navigate('https://1201-private-channel-rcw9-dun.vercel.app/');
await p.waitFor('!!document.querySelector(".start-icon")', 90000);
await p.clickSelector('.start-icon');
await p.waitFor('!!document.querySelector(".character")', 60000);
await p.evalJS('localStorage.clear()');
// 找底部导航结构
const nav = await p.evalJS(`(() => { const c=document.querySelector('.bottom-nav')||document.querySelector('nav')||document.body; return [...c.querySelectorAll('*')].slice(0,30).map(e=>e.className&&e.className.baseVal!==undefined?'svg':e.className).filter(Boolean).slice(0,20); })()`);
console.log('NAV', JSON.stringify(nav));
// 直接点击含"收藏"文本的元素
const ok = await p.evalJS(`(() => { const els=[...document.querySelectorAll('a,button,div,span')].filter(e=>e.children.length===0 && /收藏/.test(e.textContent)); if(els.length){els[0].closest('a,button,div[class]')?.click()||els[0].click();return els[0].textContent} return null })()`);
console.log('clickText', ok);
await sleep(4000);
const url = await p.evalJS('location.pathname');
const has = await p.evalJS('!!document.querySelector(".photo-container")');
console.log('PATH', url, 'photoContainer', has);
if (!has) {
  // 备选：react-router 链接
  await p.evalJS(`(() => { const a=[...document.querySelectorAll('a')].find(a=>a.getAttribute('href')&&a.getAttribute('href').includes('collection')); if(a){a.click();return true} return false })()`);
  await sleep(3000);
  console.log('afterA', await p.evalJS('location.pathname'), await p.evalJS('!!document.querySelector(".photo-container")'));
}
b.close(); child.kill(); process.exit(0);
