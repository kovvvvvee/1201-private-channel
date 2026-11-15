import { launchEdge, newPage, CDP } from './cdp.mjs';
const { child, wsUrl } = await launchEdge({ port: 9231, headless: false });
const b = new CDP(wsUrl); await b.connect();
const p = await newPage(b, { w: 390, h: 844 });
try {
  await p.navigate('https://8af1f04bcb7712.app.lhr.life');
  await p.sleep(5000);
  console.log('url:', await p.evalJS('location.href'));
  console.log('title:', await p.evalJS('document.title'));
  console.log('body:', await p.evalJS('document.body ? document.body.innerText.slice(0, 400) : "none"'));
  console.log('root html len:', await p.evalJS('document.documentElement.outerHTML.length'));
  await p.shot('deployed-debug', '.step12-test/shots');
} finally { b.close(); child.kill(); }
