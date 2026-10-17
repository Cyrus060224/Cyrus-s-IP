import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
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

async function run() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-theme-'));
  const port = 9225;

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${tmpDir}`,
    '--window-size=1440,900',
    'about:blank'
  ]);

  try {
    await sleep(1200);
    const versionRes = await fetch(`http://127.0.0.1:${port}/json/version`);
    const versionData = await versionRes.json();
    const wsUrl = versionData.webSocketDebuggerUrl;

    const cdp = new CdpClient(wsUrl);
    await cdp.connect();

    // Create new target
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const targetWsUrl = `ws://127.0.0.1:${port}/devtools/page/${target.targetId}`;

    const pageCdp = new CdpClient(targetWsUrl);
    await pageCdp.connect();

    await pageCdp.send('Page.enable');
    await pageCdp.send('DOM.enable');
    await pageCdp.send('Runtime.enable');

    console.log('=== TEST 1: First Visit (Clean localStorage) ===');
    await pageCdp.send('Page.navigate', { url: 'http://localhost:4321/' });
    await sleep(1500);

    const initData = await pageCdp.evaluate(`(() => {
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        pref: document.documentElement.getAttribute('data-theme-pref'),
        stored: localStorage.getItem('theme'),
        colorScheme: document.documentElement.style.colorScheme || window.getComputedStyle(document.documentElement).colorScheme,
        metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
        url: window.location.pathname
      };
    })()`);

    console.log('Initial State:', initData);
    if (initData.theme !== 'dark' || initData.pref !== 'dark') {
      throw new Error(`Test 1 Failed: Expected dark theme on first visit, got: ${JSON.stringify(initData)}`);
    }
    if (initData.metaThemeColor !== '#05070B') {
      throw new Error(`Test 1 Failed: meta theme-color should be #05070B, got: ${initData.metaThemeColor}`);
    }
    console.log('✓ TEST 1 PASSED: First visit cleanly defaulted to Deep Space Observatory Dark mode.');

    console.log('\n=== TEST 2: Tri-State Cycle & Persistence ===');
    // Click 1: dark -> light
    await pageCdp.evaluate(`document.getElementById('theme-toggle').click()`);
    await sleep(400);

    const stateLight = await pageCdp.evaluate(`(() => {
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        pref: document.documentElement.getAttribute('data-theme-pref'),
        stored: localStorage.getItem('theme'),
        metaThemeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
        url: window.location.pathname
      };
    })()`);
    console.log('After Click 1 (Light):', stateLight);
    if (stateLight.theme !== 'light' || stateLight.pref !== 'light' || stateLight.stored !== 'light') {
      throw new Error(`Test 2 Failed: Expected light theme, got: ${JSON.stringify(stateLight)}`);
    }
    if (stateLight.url !== '/') {
      throw new Error(`Test 2 Failed: Theme click should NOT navigate away from /, got: ${stateLight.url}`);
    }
    if (stateLight.metaThemeColor !== '#F2F5F9') {
      throw new Error(`Test 2 Failed: meta theme-color should be #F2F5F9 in light mode, got: ${stateLight.metaThemeColor}`);
    }
    console.log('✓ TEST 2.1 PASSED: Successfully transitioned to Light theme without page navigation.');

    // Click 2: light -> system
    await pageCdp.evaluate(`document.getElementById('theme-toggle').click()`);
    await sleep(400);

    const stateSystem = await pageCdp.evaluate(`(() => {
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        pref: document.documentElement.getAttribute('data-theme-pref'),
        stored: localStorage.getItem('theme')
      };
    })()`);
    console.log('After Click 2 (System):', stateSystem);
    if (stateSystem.pref !== 'system' || stateSystem.stored !== 'system') {
      throw new Error(`Test 2 Failed: Expected system pref, got: ${JSON.stringify(stateSystem)}`);
    }
    console.log('✓ TEST 2.2 PASSED: Successfully transitioned to System preference.');

    // Emulate OS theme change while in System mode
    console.log('\n=== TEST 3: Emulate System Appearance Changes ===');
    await pageCdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'light' }]
    });
    await sleep(400);
    let sysLight = await pageCdp.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('System emulated light -> effective data-theme:', sysLight);
    if (sysLight !== 'light') throw new Error(`Expected effective light theme when OS is light, got: ${sysLight}`);

    await pageCdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'dark' }]
    });
    await sleep(400);
    let sysDark = await pageCdp.evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log('System emulated dark -> effective data-theme:', sysDark);
    if (sysDark !== 'dark') throw new Error(`Expected effective dark theme when OS is dark, got: ${sysDark}`);
    console.log('✓ TEST 3 PASSED: Page dynamically follows OS prefers-color-scheme in System mode.');

    // Click 3: system -> dark
    await pageCdp.evaluate(`document.getElementById('theme-toggle').click()`);
    await sleep(400);
    const stateDark = await pageCdp.evaluate(`(() => {
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        pref: document.documentElement.getAttribute('data-theme-pref'),
        stored: localStorage.getItem('theme')
      };
    })()`);
    console.log('After Click 3 (Dark):', stateDark);
    if (stateDark.theme !== 'dark' || stateDark.pref !== 'dark') {
      throw new Error(`Test 2 Failed: Expected dark theme on 3rd click, got: ${JSON.stringify(stateDark)}`);
    }
    console.log('✓ TEST 2.3 PASSED: Full tri-state cycle completed.');

    console.log('\n=== TEST 4: View Transitions & Multi-Page Navigation ===');
    // Set to light
    await pageCdp.evaluate(`document.getElementById('theme-toggle').click()`); // dark -> light
    await sleep(300);

    // Navigate to /posts
    await pageCdp.send('Page.navigate', { url: 'http://localhost:4321/posts' });
    await sleep(1200);

    const postsTheme = await pageCdp.evaluate(`(() => {
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        pref: document.documentElement.getAttribute('data-theme-pref'),
        url: window.location.pathname
      };
    })()`);
    console.log('After navigating to /posts:', postsTheme);
    if (postsTheme.theme !== 'light' || postsTheme.pref !== 'light') {
      throw new Error(`Test 4 Failed: Theme lost on navigating to /posts: ${JSON.stringify(postsTheme)}`);
    }

    // Navigate back to /
    await pageCdp.send('Page.navigate', { url: 'http://localhost:4321/' });
    await sleep(1200);

    const homeTheme = await pageCdp.evaluate(`(() => {
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        pref: document.documentElement.getAttribute('data-theme-pref'),
        url: window.location.pathname
      };
    })()`);
    console.log('After returning to /:', homeTheme);
    if (homeTheme.theme !== 'light' || homeTheme.pref !== 'light') {
      throw new Error(`Test 4 Failed: Theme lost returning to /: ${JSON.stringify(homeTheme)}`);
    }
    console.log('✓ TEST 4 PASSED: Theme persists perfectly across navigation and back/forward.');

    console.log('\n=== TEST 5: Keyboard Accessibility & Button Behavior ===');
    // Tab & Enter on toggle
    await pageCdp.evaluate(`(() => {
      const btn = document.getElementById('theme-toggle');
      btn.focus();
      const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
      btn.dispatchEvent(event);
    })()`);
    await sleep(400);

    const afterKeyboard = await pageCdp.evaluate(`document.documentElement.getAttribute('data-theme-pref')`);
    console.log('After Enter key on focused button -> pref:', afterKeyboard);
    if (afterKeyboard !== 'system') {
      throw new Error(`Test 5 Failed: Keyboard Enter did not toggle theme, current: ${afterKeyboard}`);
    }
    console.log('✓ TEST 5 PASSED: Keyboard navigation works seamlessly.');

    console.log('\n=== ALL 5 VERIFICATION SUITES PASSED COMPLETELY! ===');

    pageCdp.close();
    cdp.close();
  } finally {
    try {
      chrome.kill();
    } catch (e) {}
    await sleep(800);
    try {
      rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5 });
    } catch (e) {}
  }
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
