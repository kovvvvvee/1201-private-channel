import { launchEdge, newPage, CDP } from './cdp.mjs';
const URL = 'https://6861e03e35a563.app.lhr.life';
const { child, wsUrl } = await launchEdge({ port: 9233 });
const b = new CDP(wsUrl); await b.connect();
const p = await newPage(b, { w: 390, h: 844 });
try {
  const t0 = Date.now();
  await p.send('Page.navigate', { url: URL });
  for (let i = 0; i < 24; i++) {
    await p.sleep(5000);
    const st = await p.evalJS(`({
      rs: document.readyState,
      title: document.title,
      icon: !!document.querySelector('.start-icon'),
      root: document.getElementById('root') ? document.getElementById('root').children.length : -1,
      scripts: [...document.scripts].map(s=>s.src||'inline').slice(0,5)
    })`).catch(e => ({ err: String(e).slice(0, 120) }));
    console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(st));
    if (st.icon) break;
  }
} finally { b.close(); child.kill(); }
