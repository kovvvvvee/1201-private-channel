import { launchEdge, newPage, CDP } from './cdp.mjs';
const { child, wsUrl } = await launchEdge({ port: 9234 });
const b = new CDP(wsUrl); await b.connect();
const p = await newPage(b, { w: 390, h: 844 });
try {
  await p.navigate('https://sheyh-36-28-220-14.run.pinggy-free.link');
  await p.sleep(4000);
  const html = await p.evalJS('document.documentElement.outerHTML');
  console.log(html.slice(0, 4000));
} finally { b.close(); child.kill(); }
