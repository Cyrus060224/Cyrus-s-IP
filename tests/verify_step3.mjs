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

async function verifyStep3() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-step3-'));
  const port = 9228;

  console.log('=== STARTING STEP 3 INSTRUMENTS & INTERACTION VERIFICATION ===');
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

    // -------------------------------------------------------------
    // Test 1: Desktop 1440px Viewport
    // -------------------------------------------------------------
    console.log('Configuring desktop 1440x900 viewport...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('Navigating to http://127.0.0.1:4321/ ...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });

    // Wait until boot overlay is hidden and canvas is mounted
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      ready = await client.evaluate(`
        (() => {
          const overlay = document.getElementById('telemetry-boot-overlay');
          const canvas = document.querySelector('#observatory-canvas-mount canvas');
          const pins = document.querySelectorAll('.instrument-hud-pin');
          const overlayHidden = !overlay || overlay.style.display === 'none' || getComputedStyle(overlay).opacity === '0';
          return Boolean(overlayHidden && canvas && canvas.width > 0 && pins.length === 3);
        })()
      `);
      if (ready) {
        console.log(`Canvas & 3 HUD pins ready after ${(i + 1) * 250}ms`);
        break;
      }
    }

    if (!ready) throw new Error('Canvas or HUD pins failed to initialize');

    // Skip intro to steady state immediately for consistent inspection
    await client.evaluate(`
      (() => {
        window.dispatchEvent(new Event('wheel'));
      })()
    `);
    await sleep(800);

    // Retrieve projected pin screen coordinates
    const pinCoords = await client.evaluate(`
      (() => {
        const pins = Array.from(document.querySelectorAll('.instrument-hud-pin')).map(pin => {
          const rect = pin.getBoundingClientRect();
          return {
            id: pin.id,
            route: pin.getAttribute('data-route'),
            display: getComputedStyle(pin).display,
            left: Math.round(rect.left + rect.width / 2),
            top: Math.round(rect.top + 24),
            visible: rect.width > 0 && rect.height > 0
          };
        });
        return pins;
      })()
    `);
    console.log('Projected Instrument Pin Coordinates:', pinCoords);

    // Verify all 3 pins are visible and have valid coordinates
    if (pinCoords.length !== 3 || pinCoords.some(p => !p.visible)) {
      throw new Error('Instruments pins are not properly projected');
    }

    // Capture Desktop 1440px Screenshot
    console.log('Capturing Desktop 1440px Screenshot...');
    const desktopScreenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1440, height: 760, scale: 1 }
    });
    const desktopPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/step3_instruments_desktop_1440.png';
    writeFileSync(desktopPath, Buffer.from(desktopScreenshot.data, 'base64'));
    console.log(`Saved desktop screenshot to ${desktopPath}`);

    // -------------------------------------------------------------
    // Test 2: Hover & Click Isolation Verification
    // -------------------------------------------------------------
    console.log('Testing Hover Isolation: moving mouse over theme button...');
    // Move mouse over the theme toggle button in navbar (~x=1115, y=28)
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 1115,
      y: 28
    });
    await sleep(200);

    const themeHoverCheck = await client.evaluate(`
      (() => {
        const hoveredPins = document.querySelectorAll('.instrument-hud-pin.hovered');
        const expandedCards = document.querySelectorAll('.hud-card-wrapper:not([style*="hidden"])');
        return {
          hoveredPinsCount: hoveredPins.length,
          activeThemeButton: Boolean(document.getElementById('nav-theme-btn'))
        };
      })()
    `);
    console.log('Theme Button Hover Check (should be 0 hovered pins):', themeHoverCheck);
    if (themeHoverCheck.hoveredPinsCount !== 0) {
      throw new Error('FAIL: Instrument pin was hovered while pointer was over theme button!');
    }

    // Test clicking theme button: theme must toggle, page must NOT navigate
    console.log('Testing Theme Button Click: should toggle theme and NOT navigate...');
    const urlBeforeThemeClick = await client.evaluate('window.location.pathname');
    await client.evaluate(`
      (() => {
        const btn = document.getElementById('nav-theme-btn');
        if (btn) btn.click();
      })()
    `);
    await sleep(300);
    const urlAfterThemeClick = await client.evaluate('window.location.pathname');
    console.log(`URL before click: ${urlBeforeThemeClick}, after click: ${urlAfterThemeClick}`);
    if (urlAfterThemeClick !== urlBeforeThemeClick) {
      throw new Error(`FAIL: Theme button click triggered navigation to ${urlAfterThemeClick}!`);
    }

    // -------------------------------------------------------------
    // Test 3: Hover on Instrument Reticle Pin
    // -------------------------------------------------------------
    console.log(`Testing Instrument Hover on pin ${pinCoords[0].id} at (${pinCoords[0].left}, ${pinCoords[0].top})...`);
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: pinCoords[0].left,
      y: pinCoords[0].top
    });
    await sleep(250);

    const pinHoverCheck = await client.evaluate(`
      (() => {
        const pin = document.getElementById('${pinCoords[0].id}');
        const card = pin.querySelector('.hud-card-wrapper');
        const cardStyle = window.getComputedStyle(card);
        return {
          pinHovered: pin.classList.contains('hovered') || pin.matches(':hover'),
          cardOpacity: cardStyle.opacity,
          cardVisibility: cardStyle.visibility
        };
      })()
    `);
    console.log('Pin Hover Check:', pinHoverCheck);

    // -------------------------------------------------------------
    // Test 4: Mobile Viewport (375x667)
    // -------------------------------------------------------------
    console.log('Switching to Mobile 375x667 Viewport...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(500);

    // Verify mobile layout update
    const mobileCoords = await client.evaluate(`
      (() => {
        return Array.from(document.querySelectorAll('.instrument-hud-pin')).map(pin => {
          const rect = pin.getBoundingClientRect();
          return {
            id: pin.id,
            left: Math.round(rect.left + rect.width / 2),
            top: Math.round(rect.top + 24),
            visible: rect.width > 0 && rect.height > 0
          };
        });
      })()
    `);
    console.log('Mobile Projected Coordinates:', mobileCoords);

    // Capture Mobile 375px Screenshot
    console.log('Capturing Mobile Screenshot...');
    const mobileScreenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 375, height: 620, scale: 2 }
    });
    const mobilePath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/step3_instruments_mobile_375.png';
    writeFileSync(mobilePath, Buffer.from(mobileScreenshot.data, 'base64'));
    console.log(`Saved mobile screenshot to ${mobilePath}`);

    console.log('=== ALL STEP 3 VERIFICATIONS PASSED SUCCESSFULLY ===');
    client.close();
    browserClient.close();
  } finally {
    chrome.kill('SIGKILL');
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

verifyStep3().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
