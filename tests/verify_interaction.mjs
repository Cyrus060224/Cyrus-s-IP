import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Helper for CDP client over native WebSocket
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
    return res.result?.result?.value !== undefined ? res.result.result.value : res.result?.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-cdp-'));
  const port = 9224;

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${tmpDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    '--enable-webgl',
    '--use-gl=angle',
    '--use-angle=swiftshader'
  ]);

  try {
    // Wait for Chrome CDP endpoint
    let versionData = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch (e) {}
    }

    if (!versionData) throw new Error('Failed to connect to Chrome CDP');

    // Get existing page target from /json/list
    const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const tabs = await listRes.json();
    const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
    const client = new CdpClient(pageTab.webSocketDebuggerUrl);
    await client.connect();

    // Enable Page, Runtime, DOM, Input
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    // Set 1440x900 desktop viewport
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('--- Navigating to http://127.0.0.1:4322/ ---');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:4322/' });

    // Ensure external stylesheet (@import fonts) is completely loaded and computed
    await client.evaluate('document.fonts.ready');
    console.log('--- Fonts and stylesheets ready, waiting for 3D stage initialization ---');
    await new Promise(r => setTimeout(r, 2000));

    // Helper to get element bounds
    async function getElementRect(selector) {
      return await client.evaluate(`
        (() => {
          const el = document.querySelector('${selector}');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
        })()
      `);
    }

    // Helper to check hover count
    async function getHoveredPins() {
      return await client.evaluate(`
        Array.from(document.querySelectorAll('.instrument-hud-pin.hovered')).map(el => el.id)
      `);
    }

    // Helper to check current theme and URL
    async function getPageStatus() {
      return await client.evaluate(`
        ({
          theme: document.documentElement.getAttribute('data-theme'),
          url: window.location.href,
          pathname: window.location.pathname
        })
      `);
    }

    const themeBtnRect = await getElementRect('#theme-toggle');
    console.log('Theme toggle button position:', themeBtnRect);
    const themeBtnCenter = {
      x: themeBtnRect.left + themeBtnRect.width / 2,
      y: themeBtnRect.top + themeBtnRect.height / 2
    };

    // TEST 1: Initial state
    console.log('\n[TEST 1] Initial state check');
    let hovered = await getHoveredPins();
    let status = await getPageStatus();
    console.log('Initial hovered pins:', hovered, 'Theme:', status.theme, 'URL:', status.url);
    if (hovered.length !== 0) throw new Error('Initial pins should not be hovered');

    // TEST 2: Move mouse to Theme Toggle button (outside canvas)
    console.log('\n[TEST 2] Moving pointer directly to theme toggle button');
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: themeBtnCenter.x,
      y: themeBtnCenter.y
    });
    await new Promise(r => setTimeout(r, 400));
    hovered = await getHoveredPins();
    console.log('Hovered pins while mouse is over theme button:', hovered);
    if (hovered.length !== 0) throw new Error('Theme button must NOT trigger instrument hover!');

    // TEST 3: Click Theme Toggle button
    console.log('\n[TEST 3] Clicking theme toggle button');
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: themeBtnCenter.x,
      y: themeBtnCenter.y,
      button: 'left',
      clickCount: 1
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: themeBtnCenter.x,
      y: themeBtnCenter.y,
      button: 'left',
      clickCount: 1
    });
    await new Promise(r => setTimeout(r, 850)); // wait beyond 720ms dolly delay
    status = await getPageStatus();
    console.log('Status after clicking theme button: Theme =', status.theme, 'Path =', status.pathname);
    if (status.pathname !== '/') throw new Error('Clicking theme toggle wrongly navigated to ' + status.pathname);
    if (status.theme !== 'light') throw new Error('Theme did not toggle to light');

    // TEST 4: Pointer in Hero blank area
    console.log('\n[TEST 4] Moving pointer to Hero blank area (X=600, Y=350)');
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 600,
      y: 350
    });
    await new Promise(r => setTimeout(r, 300));
    hovered = await getHoveredPins();
    console.log('Hovered pins in Hero blank area:', hovered);
    if (hovered.length !== 0) throw new Error('Hero blank area must NOT trigger instrument hover!');

    console.log('Clicking Hero blank area (X=600, Y=350)');
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 600,
      y: 350,
      button: 'left',
      clickCount: 1
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 600,
      y: 350,
      button: 'left',
      clickCount: 1
    });
    await new Promise(r => setTimeout(r, 850));
    status = await getPageStatus();
    console.log('Status after clicking Hero blank area: Path =', status.pathname);
    if (status.pathname !== '/') throw new Error('Clicking Hero blank area wrongly navigated!');

    // TEST 5: Path (b): Hover PRJ-02 instrument, then move to theme button and click
    console.log('\n[TEST 5] Path (b): Hover PRJ-02, then move to theme button & click');
    const prjPinRect = await getElementRect('#hud-pin-projects');
    console.log('PRJ-02 pin position:', prjPinRect);
    const prjPinCenter = {
      x: prjPinRect.left + prjPinRect.width / 2,
      y: prjPinRect.top + 24
    };

    console.log('Hovering PRJ-02 pin at', prjPinCenter);
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: prjPinCenter.x,
      y: prjPinCenter.y
    });
    await new Promise(r => setTimeout(r, 400));
    hovered = await getHoveredPins();
    console.log('Hovered pins when over PRJ-02:', hovered);
    if (!hovered.includes('hud-pin-projects')) throw new Error('PRJ-02 pin was not hovered when pointer was over it');

    console.log('Moving pointer from PRJ-02 up to Theme Toggle button');
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: themeBtnCenter.x,
      y: themeBtnCenter.y
    });
    await new Promise(r => setTimeout(r, 300));
    hovered = await getHoveredPins();
    console.log('Hovered pins after leaving PRJ-02 and reaching theme button:', hovered);
    if (hovered.length !== 0) throw new Error('PRJ-02 hover state was not cleared after leaving canvas!');

    console.log('Clicking theme toggle button after hover sequence');
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: themeBtnCenter.x,
      y: themeBtnCenter.y,
      button: 'left',
      clickCount: 1
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: themeBtnCenter.x,
      y: themeBtnCenter.y,
      button: 'left',
      clickCount: 1
    });
    await new Promise(r => setTimeout(r, 850));
    status = await getPageStatus();
    console.log('Status after path (b): Theme =', status.theme, 'Path =', status.pathname);
    if (status.pathname !== '/') throw new Error('Path (b) wrongly navigated to ' + status.pathname);
    if (status.theme !== 'dark') throw new Error('Theme did not toggle back to dark');

    // TEST 6: Keyboard interaction (Tab + Enter on theme toggle)
    console.log('\n[TEST 6] Keyboard interaction on theme toggle button');
    await client.evaluate(`document.getElementById('theme-toggle').focus()`);
    await client.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    });
    await new Promise(r => setTimeout(r, 850));
    status = await getPageStatus();
    console.log('Status after keyboard Enter on theme button: Theme =', status.theme, 'Path =', status.pathname);
    if (status.pathname !== '/') throw new Error('Keyboard operation on theme toggle wrongly navigated!');
    if (status.theme !== 'light') throw new Error('Theme did not toggle via keyboard');

    // TEST 7: Page scrolled state
    console.log('\n[TEST 7] Testing while page is scrolled down 150px');
    await client.evaluate(`window.scrollTo(0, 150)`);
    await new Promise(r => setTimeout(r, 300));

    // Move to theme button while scrolled
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: themeBtnCenter.x,
      y: themeBtnCenter.y
    });
    await new Promise(r => setTimeout(r, 300));
    hovered = await getHoveredPins();
    console.log('Hovered pins when scrolled & pointer on theme toggle:', hovered);
    if (hovered.length !== 0) throw new Error('Theme button while scrolled must NOT trigger hover!');

    // Click theme button while scrolled
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: themeBtnCenter.x,
      y: themeBtnCenter.y,
      button: 'left',
      clickCount: 1
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: themeBtnCenter.x,
      y: themeBtnCenter.y,
      button: 'left',
      clickCount: 1
    });
    await new Promise(r => setTimeout(r, 850));
    status = await getPageStatus();
    console.log('Status after clicking theme toggle while scrolled: Theme =', status.theme, 'Path =', status.pathname);
    if (status.pathname !== '/') throw new Error('Clicking theme button while scrolled wrongly navigated!');

    // TEST 8: Clicking the instrument itself still triggers navigation
    console.log('\n[TEST 8] Direct click on PRJ-02 pin initiates navigation');
    await client.evaluate(`window.scrollTo(0, 0)`);
    await new Promise(r => setTimeout(r, 300));
    const prjPinLatest = await getElementRect('#hud-pin-projects');
    const prjCenterLatest = {
      x: prjPinLatest.left + prjPinLatest.width / 2,
      y: prjPinLatest.top + 24
    };
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: prjCenterLatest.x,
      y: prjCenterLatest.y,
      button: 'left',
      clickCount: 1
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: prjCenterLatest.x,
      y: prjCenterLatest.y,
      button: 'left',
      clickCount: 1
    });
    // Wait for the 720ms dolly transition + navigation
    await new Promise(r => setTimeout(r, 1200));
    status = await getPageStatus();
    console.log('Status after clicking PRJ-02: Path =', status.pathname);
    if (status.pathname !== '/projects' && status.pathname !== '/projects/') {
      throw new Error('Clicking PRJ-02 should navigate to /projects, got ' + status.pathname);
    }

    console.log('\n>>> ALL 8 ACCEPTANCE TESTS PASSED FLIP-FREE AND ERROR-FREE! <<<');
    client.close();
  } finally {
    chrome.kill();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch(err => {
  console.error('\nFAIL:', err);
  process.exit(1);
});
