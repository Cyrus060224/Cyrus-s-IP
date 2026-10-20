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

async function testThemeBehavior() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-theme-test-'));
  const port = 9280;

  console.log('=== STARTING THEME PERSISTENCE & DEFAULT TEST ===');
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${tmpDir}`,
    '--enable-webgl',
    '--use-gl=angle',
    '--use-angle=metal',
    '--no-first-run'
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

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    // 1. First-time visitor test (clean storage)
    console.log('\n--- 1. Testing First-time Visitor (No localStorage) ---');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
    await sleep(3500);

    const firstTimeTheme = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    const storedKey = await client.evaluate(`localStorage.getItem('cyrus_theme')`);
    const moonVisible = await client.evaluate(`window.getComputedStyle(document.querySelector('.icon-moon')).display`);
    const sunVisible = await client.evaluate(`window.getComputedStyle(document.querySelector('.icon-sun')).display`);

    console.log('Initial Theme (expected "dark"):', firstTimeTheme);
    console.log('Stored cyrus_theme (expected null):', storedKey);
    console.log('Moon icon display (expected "inline-flex"):', moonVisible);
    console.log('Sun icon display (expected "none"):', sunVisible);

    if (firstTimeTheme !== 'dark') throw new Error('First-time visitor did NOT get dark theme!');

    // Capture screenshot of clean first-time visit
    const firstShot = await client.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/first_time_dark_verified.png', Buffer.from(firstShot.data, 'base64'));
    console.log('Saved first-time visitor screenshot to first_time_dark_verified.png');

    // 2. Click toggle once -> switches to Light
    console.log('\n--- 2. Toggling to Light Mode ---');
    await client.evaluate(`document.getElementById('theme-toggle')?.click()`);
    await sleep(1000);

    const switchedToLight = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    const storedLight = await client.evaluate(`localStorage.getItem('cyrus_theme')`);
    const sunVisibleNow = await client.evaluate(`window.getComputedStyle(document.querySelector('.icon-sun')).display`);

    console.log('Theme after 1st click (expected "light"):', switchedToLight);
    console.log('Stored cyrus_theme (expected "light"):', storedLight);
    console.log('Sun icon display (expected "inline-flex"):', sunVisibleNow);

    if (switchedToLight !== 'light' || storedLight !== 'light') throw new Error('Failed to toggle directly to light theme!');

    // 3. Reload page -> must PRESERVE Light mode for returning visitor
    console.log('\n--- 3. Reloading Page (Returning Visitor with Light preference) ---');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
    await sleep(2500);

    const preservedLight = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Theme on reload (expected "light"):', preservedLight);
    if (preservedLight !== 'light') throw new Error('Returning visitor preference was not preserved!');

    // 4. Click toggle again -> switches back to Dark
    console.log('\n--- 4. Toggling back to Dark Mode ---');
    await client.evaluate(`document.getElementById('theme-toggle')?.click()`);
    await sleep(1000);

    const switchedBackToDark = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    const storedDark = await client.evaluate(`localStorage.getItem('cyrus_theme')`);
    console.log('Theme after 2nd click (expected "dark"):', switchedBackToDark);
    console.log('Stored cyrus_theme (expected "dark"):', storedDark);

    if (switchedBackToDark !== 'dark' || storedDark !== 'dark') throw new Error('Failed to toggle directly back to dark theme!');

    // 5. Reload page -> must PRESERVE Dark mode
    console.log('\n--- 5. Reloading Page (Returning Visitor with Dark preference) ---');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
    await sleep(2500);

    const preservedDark = await client.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('Theme on reload (expected "dark"):', preservedDark);
    if (preservedDark !== 'dark') throw new Error('Returning visitor dark preference was not preserved!');

    console.log('\n=== ALL THEME VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
    client.close();
    browserClient.close();
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    chrome.kill('SIGKILL');
  }
}

testThemeBehavior();
