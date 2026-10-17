import { spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
          console.log('[BROWSER CONSOLE]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails);
        }
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
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function capture() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-capture-'));
  const port = 9226;

  console.log('Launching Chrome headless with WebGL enabled...');
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
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch (e) {}
    }

    if (!versionData) throw new Error('Chrome CDP connection timeout');

    const browserClient = new CdpClient(versionData.webSocketDebuggerUrl);
    await browserClient.connect();

    const target = await browserClient.send('Target.createTarget', { url: 'about:blank' });
    const client = new CdpClient(`ws://127.0.0.1:${port}/devtools/page/${target.targetId}`);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('Navigating to http://127.0.0.1:4321/ ...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });

    // Wait until boot overlay is gone and canvas is initialized
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      ready = await client.evaluate(`
        (() => {
          const overlay = document.getElementById('telemetry-boot-overlay');
          const canvas = document.querySelector('#observatory-canvas-mount canvas');
          const overlayHidden = !overlay || overlay.style.display === 'none' || getComputedStyle(overlay).opacity === '0';
          return Boolean(overlayHidden && canvas && canvas.width > 0);
        })()
      `);
      if (ready) {
        console.log(`Ready after ${(i + 1) * 250}ms`);
        break;
      }
    }

    const canvasInfo = await client.evaluate(`
      (() => {
        const canvas = document.querySelector('#observatory-canvas-mount canvas');
        if (!canvas) return { found: false };
        return {
          found: true,
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight
        };
      })()
    `);
    console.log('Canvas info:', canvasInfo);

    // Wait 1.5s more so multiple render frames complete cleanly
    await sleep(1500);

    console.log('Capturing 1440x900 screenshot...');
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });

    const targetPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/step1_orbital_sunrise_1440.png';
    writeFileSync(targetPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Successfully saved screenshot to: ${targetPath}`);

    client.close();
    browserClient.close();
  } finally {
    chrome.kill();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
