import { spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

class CdpClient {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 1; this.callbacks = new Map(); }
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }
  close() { if (this.ws) this.ws.close(); }
}
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function captureHover() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-hover-'));
  const port = 9233;
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${tmpDir}`,
    '--window-size=1440,900',
    '--enable-webgl',
    '--use-gl=angle',
    '--use-angle=metal',
    'about:blank'
  ]);

  try {
    let versionData = null;
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) { versionData = await res.json(); break; }
      } catch (e) {}
    }
    const browserClient = new CdpClient(versionData.webSocketDebuggerUrl);
    await browserClient.connect();
    const target = await browserClient.send('Target.createTarget', { url: 'about:blank' });
    const client = new CdpClient(`ws://127.0.0.1:${port}/devtools/page/${target.targetId}`);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
    await sleep(4000);

    // Skip intro
    await client.evaluate('window.dispatchEvent(new Event("wheel"))');
    await sleep(600);

    // Hover over PRJ-02 pin
    const prjPin = await client.evaluate(`
      (() => {
        const pin = document.getElementById('hud-pin-projects');
        const rect = pin.getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + 24) };
      })()
    `);

    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: prjPin.x,
      y: prjPin.y
    });
    await sleep(400);

    const shot = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1440, height: 760, scale: 1 }
    });
    writeFileSync('/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/step3_instruments_hover_card.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved hover card screenshot to step3_instruments_hover_card.png');

    client.close();
    browserClient.close();
  } finally {
    chrome.kill('SIGKILL');
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}
captureHover();
