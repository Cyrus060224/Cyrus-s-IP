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

async function verifyDetheme() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-detheme-'));
  const port = 9230;

  console.log('=== STARTING DE-THEMATIZATION VERIFICATION ===');
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

    // 1. Desktop 1440x900 viewport test
    console.log('\n--- 1. Testing 1440x900 Desktop Viewport ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
    await sleep(2500);

    // Verify Title & Subtitle
    const titleText = await client.evaluate(`document.querySelector('.hero-main-title')?.innerText`);
    const subDescText = await client.evaluate(`document.querySelector('.hero-sub-desc')?.innerText`);
    console.log('Hero Title:', JSON.stringify(titleText));
    console.log('Hero Subtitle:', JSON.stringify(subDescText));

    // Verify 3 Entry Cards
    const cards = await client.evaluate(`
      Array.from(document.querySelectorAll('.hero-entry-card')).map(c => ({
        href: c.getAttribute('href'),
        title: c.querySelector('.card-title')?.innerText,
        desc: c.querySelector('.card-desc')?.innerText,
        meta: c.querySelector('.card-meta')?.innerText
      }))
    `);
    console.log('Entry Cards found:', cards);

    // Verify Navigation Links
    const navLinks = await client.evaluate(`
      Array.from(document.querySelectorAll('.site-header .nav-link')).map(l => ({
        href: l.getAttribute('href'),
        text: l.innerText.trim()
      }))
    `);
    console.log('Nav Links:', navLinks);

    // Check viewport visibility of Latest Articles section
    const articlesVisibility = await client.evaluate(`(() => {
      const sec = document.querySelector('.featured-section') || document.querySelector('.recent-posts-section');
      if (!sec) return null;
      const rect = sec.getBoundingClientRect();
      const title = sec.querySelector('.section-title')?.innerText;
      return {
        title,
        top: rect.top,
        bottom: rect.bottom,
        visibleInFold: rect.top < 900 && rect.bottom > 600
      };
    })()`);
    console.log('Latest Articles section position relative to 900px fold:', articlesVisibility);

    // Capture 1440x900 Desktop Screenshot
    const deskShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const deskPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/detheme_desktop_1440.png';
    writeFileSync(deskPath, Buffer.from(deskShot.data, 'base64'));
    console.log('Saved 1440px desktop screenshot to:', deskPath);

    // 2. Test Theme Toggle
    console.log('\n--- 2. Testing Theme Switcher & Isolation ---');
    const initialTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Initial theme:', initialTheme);

    await client.evaluate(`document.getElementById('theme-toggle')?.click()`);
    await sleep(400);

    const toggledTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    const currentUrl = await client.evaluate(`window.location.pathname`);
    console.log('Theme after 1 click:', toggledTheme, 'Current URL:', currentUrl);

    // Capture Light Theme Screenshot
    const lightShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const lightPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/detheme_light_theme.png';
    writeFileSync(lightPath, Buffer.from(lightShot.data, 'base64'));
    console.log('Saved light theme screenshot to:', lightPath);

    // Toggle back to dark
    await client.evaluate(`document.getElementById('theme-toggle')?.click()`);
    await sleep(200);
    await client.evaluate(`document.getElementById('theme-toggle')?.click()`);
    await sleep(200);

    // 3. Mobile Viewport Test (375x812)
    console.log('\n--- 3. Testing 375x812 Mobile Viewport ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 3,
      mobile: true
    });
    await sleep(1000);

    const mobileShot = await client.send('Page.captureScreenshot', { format: 'png' });
    const mobilePath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/detheme_mobile_375.png';
    writeFileSync(mobilePath, Buffer.from(mobileShot.data, 'base64'));
    console.log('Saved 375px mobile screenshot to:', mobilePath);

    client.close();
  } finally {
    chrome.kill('SIGKILL');
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

verifyDetheme().then(() => console.log('\n=== VERIFICATION FINISHED SUCCESSFULLY ===')).catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
