import { launchEdge, newPage, CDP } from './cdp.mjs';
const { child, wsUrl } = await launchEdge({ port: 9232 });
const b = new CDP(wsUrl); await b.connect();
const p = await newPage(b, { w: 390, h: 844 });
try {
  await p.send('Network.enable');
  await p.send('Network.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  });
  await p.navigate('https://sonic-maple-xczk7cw.tmp.now');
  await p.sleep(6000);
  console.log('title:', await p.evalJS('document.title'));
  console.log('hasStartIcon:', await p.evalJS(`!!document.querySelector('.start-icon')`));
} finally { b.close(); child.kill(); }
