// 极简 CDP 驱动：通过 Edge --remote-debugging-port 控制真实浏览器
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

export async function getJson(url) {
  const r = await fetch(url);
  return r.json();
}

export class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.eventHandlers = [];
    this.consoleErrors = [];
    this.exceptions = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        } else if (msg.method) {
          for (const h of this.eventHandlers) h(msg);
        }
      };
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  on(fn) { this.eventHandlers.push(fn); }
  close() { try { this.ws.close(); } catch {} }
}

export async function launchEdge({ port = 9223, extraArgs = [], headless = true } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-step12-'));
  const child = spawn(EDGE, [
    ...(headless ? ['--headless=new'] : []),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-extensions',
    ...extraArgs,
    'about:blank',
  ], { stdio: 'ignore' });
  // 等待 devtools 就绪
  let version = null;
  for (let i = 0; i < 50; i++) {
    try {
      version = await getJson(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  if (!version) throw new Error('Edge devtools not ready');
  return { child, wsUrl: version.webSocketDebuggerUrl, profile, port };
}

export class Page {
  constructor(browser, sessionId) {
    this.b = browser;
    this.sid = sessionId;
  }
  send(method, params) { return this.b.send(method, params, this.sid); }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable').catch(() => {});
    // JS dialog 自动接受（alert 等）
    this.b.on(async (msg) => {
      if (msg.method === 'Page.javascriptDialogOpening') {
        await this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.b.exceptions.push(d.text + ' ' + (d.exception?.description || ''));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.b.consoleErrors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
      }
    });
  }

  async evalJS(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error('evalJS failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
    }
    return r.result.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor('document.readyState === "complete"', 15000);
  }

  async waitFor(expr, timeout = 15000, poll = 200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await this.evalJS(`!!(${expr})`)) return true;
      } catch {}
      await new Promise(r => setTimeout(r, poll));
    }
    return false;
  }

  async sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async shot(name, dir) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(dir, name + '.png');
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }

  async viewport(w, h, { mobile = true, dsf = 3, touch = true } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: dsf, mobile,
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
  }

  async clearViewport() {
    await this.send('Emulation.clearDeviceMetricsOverride');
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  async clickSelector(sel) {
    const pt = await this.evalJS(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      el.scrollIntoView({block:'center', inline:'center'});
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    })()`);
    if (!pt) throw new Error('clickSelector: not found ' + sel);
    await this.mouse(pt.x, pt.y);
  }

  async mouse(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type, x, y, button: 'left', clickCount: 1,
      });
    }
  }

  async clickEl(index) { // click nth element matching selector
    const pt = await this.evalJS(`(() => {
      const el = document.querySelectorAll('.nav-button')[${index}];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    })()`);
    if (!pt) throw new Error('nav button not found');
    await this.mouse(pt.x, pt.y);
  }

  async typeInto(sel, text) {
    // React 兼容的受控输入写入
    await this.evalJS(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }

  async pressEnter(sel) {
    // React onKeyPress 监听原生 keypress 事件
    await this.evalJS(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      el.focus();
      for (const type of ['keydown', 'keypress', 'keyup']) {
        el.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
        }));
      }
    })()`);
  }

  async swipeOn(sel, fromXRatio, toXRatio, yRatio = 0.5) {
    const box = await this.evalJS(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    })()`);
    if (!box) throw new Error('swipeOn: not found ' + sel);
    const y = box.top + box.height * yRatio;
    const x1 = box.left + box.width * fromXRatio;
    const x2 = box.left + box.width * toXRatio;
    const mk = (x) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 });
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [mk(x1)] });
    for (let i = 1; i <= 5; i++) {
      await this.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [mk(x1 + (x2 - x1) * i / 5)],
      });
    }
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}

export async function newPage(browser, { w = 390, h = 844, url = 'about:blank' } = {}) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(browser, sessionId);
  await page.init();
  if (w && h) await page.viewport(w, h);
  return page;
}
