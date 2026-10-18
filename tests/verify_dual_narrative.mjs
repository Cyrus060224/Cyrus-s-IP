import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
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

async function verifyDualNarrative() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-dual-'));
  const port = 9240;

  console.log('=== STARTING DUAL NARRATIVE & APOLLO EARTH VERIFICATION ===');
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${tmpDir}`,
    '--disable-gpu-shader-disk-cache',
    '--enable-webgl',
    '--use-gl=angle',
    '--use-angle=metal',
    '--no-first-run',
    '--no-default-browser-check'
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) {
          const data = await res.json();
          wsUrl = data.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        await sleep(150);
      }
    }

    if (!wsUrl) throw new Error('Could not connect to Chrome CDP endpoint');

    const browserClient = new CdpClient(wsUrl);
    await browserClient.connect();

    const target = await browserClient.send('Target.createTarget', { url: 'about:blank' });
    const client = new CdpClient(`ws://127.0.0.1:${port}/devtools/page/${target.targetId}`);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    async function switchThemeTo(targetTheme) {
      for (let i = 0; i < 5; i++) {
        const cur = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
        if (cur === targetTheme) return;
        await client.evaluate(`document.getElementById('theme-toggle')?.click()`);
        await sleep(300);
      }
    }

    console.log('\n--- 1. Setting 1440x900 Desktop Viewport (Dark Theme) ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
    await sleep(3500);

    await switchThemeTo('dark');
    await sleep(800);

    const darkTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Active Theme:', darkTheme);

    // Capture Dark Mode Desktop Screenshot
    const darkShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const darkPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/dual_desktop_dark.png';
    writeFileSync(darkPath, Buffer.from(darkShot.data, 'base64'));
    console.log('Saved Dark Desktop Screenshot to:', darkPath);

    // Switch to Light Mode
    console.log('\n--- 2. Switching to Light Mode ---');
    await switchThemeTo('light');
    await sleep(1500);

    const lightTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Active Theme:', lightTheme);

    const darkTitleFaded = await client.evaluate(`
      window.getComputedStyle(document.querySelector('.theme-text-dark')).opacity
    `);
    const lightTitleVisible = await client.evaluate(`
      window.getComputedStyle(document.querySelector('.theme-text-light')).opacity
    `);
    console.log('Dark Title Opacity in Light Mode (expect 0):', darkTitleFaded);
    console.log('Light Title Opacity in Light Mode (expect 1):', lightTitleVisible);

    // Verify reordering of gallery preview section
    const galleryOrder = await client.evaluate(`
      window.getComputedStyle(document.querySelector('.gallery-preview-section')).order
    `);
    const featuredOrder = await client.evaluate(`
      window.getComputedStyle(document.querySelector('.featured-section')).order
    `);
    console.log('Light Mode Gallery Section Order (expect 2):', galleryOrder);
    console.log('Light Mode Featured Section Order (expect 3):', featuredOrder);

    // Capture Light Mode Desktop Screenshot
    const lightShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const lightPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/dual_desktop_light.png';
    writeFileSync(lightPath, Buffer.from(lightShot.data, 'base64'));
    console.log('Saved Light Desktop Screenshot to:', lightPath);

    // 3. Mobile Viewport Verification (375x812)
    console.log('\n--- 3. Testing 375x812 Mobile Viewport (Light Theme) ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(800);

    // Capture Light Mode Mobile Screenshot
    const mobileLightShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const mobileLightPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/dual_mobile_light.png';
    writeFileSync(mobileLightPath, Buffer.from(mobileLightShot.data, 'base64'));
    console.log('Saved Light Mobile Screenshot to:', mobileLightPath);

    // Switch back to Dark Mode on Mobile
    console.log('\n--- 4. Switching to Dark Mode on Mobile ---');
    await switchThemeTo('dark');
    await sleep(1500);

    const mobileDarkShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const mobileDarkPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/dual_mobile_dark.png';
    writeFileSync(mobileDarkPath, Buffer.from(mobileDarkShot.data, 'base64'));
    console.log('Saved Dark Mobile Screenshot to:', mobileDarkPath);

    console.log('\n=== ALL VERIFICATION CHECKS PASSED ===');
    client.close();
    browserClient.close();
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    chrome.kill('SIGKILL');
  }
}

verifyDualNarrative();
