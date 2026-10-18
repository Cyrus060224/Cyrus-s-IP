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

async function verifyOption1() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-option1-'));
  const port = 9235;

  console.log('=== STARTING OPTION 1 VERIFICATION ===');
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

    console.log('\n--- 1. Setting 1440x900 Desktop Viewport ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
    await sleep(3500);

    const initialTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Initial Theme (Dark):', initialTheme);

    // Capture Dark Mode Screenshot
    const darkShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const darkPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/option1_desktop_dark.png';
    writeFileSync(darkPath, Buffer.from(darkShot.data, 'base64'));
    console.log('Saved Dark Mode screenshot to:', darkPath);

    // Switch to Light Mode
    console.log('\n--- 2. Switching to Light Mode via #theme-toggle ---');
    await client.evaluate(`document.getElementById('theme-toggle')?.click()`);
    // Wait for smooth lerp transition (350-500ms transition + render)
    await sleep(1500);

    const lightTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Theme after click:', lightTheme);

    // Verify Title and Card CSS properties in light mode
    const titleColor = await client.evaluate(`window.getComputedStyle(document.querySelector('.hero-main-title')).color`);
    const cardBg = await client.evaluate(`window.getComputedStyle(document.querySelector('.hero-entry-card')).backgroundColor`);
    const cardBorder = await client.evaluate(`window.getComputedStyle(document.querySelector('.hero-entry-card')).borderColor`);
    console.log('Light Mode Title Color:', titleColor);
    console.log('Light Mode Card Background:', cardBg);
    console.log('Light Mode Card Border:', cardBorder);

    // Capture Option 1 Light Mode Screenshot
    const lightShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const lightPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/option1_preview_desktop_light.png';
    writeFileSync(lightPath, Buffer.from(lightShot.data, 'base64'));
    console.log('Saved Option 1 Light Mode screenshot to:', lightPath);

    // 3. Direct Reload in Light Mode
    console.log('\n--- 3. Testing Direct Page Load in Light Mode ---');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
    await sleep(2500);

    const directTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Theme on reload:', directTheme);

    const directLightShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const directLightPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/option1_direct_light_reload.png';
    writeFileSync(directLightPath, Buffer.from(directLightShot.data, 'base64'));
    console.log('Saved Direct Light Reload screenshot to:', directLightPath);

    client.close();
  } finally {
    chrome.kill('SIGKILL');
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

verifyOption1().then(() => console.log('\n=== OPTION 1 VERIFICATION COMPLETE ===')).catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
