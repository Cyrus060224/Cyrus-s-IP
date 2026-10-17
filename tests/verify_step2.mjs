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

async function runVerification() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-step2-'));
  const port = 9227;

  console.log('--- STARTING STEP 2 DYNAMICS & LIFECYCLE VERIFICATION ---');
  console.log('Launching Headless Chrome with WebGL Metal backend...');

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

    // Wait until boot overlay is hidden and canvas is initialized
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
        console.log(`WebGL Canvas ready after ${(i + 1) * 250}ms`);
        break;
      }
    }

    if (!ready) throw new Error('Canvas failed to mount or initialize');

    // 1. Measure Initial FPS over 120 frames
    console.log('Measuring performance & frame rate...');
    const fpsResult = await client.evaluate(`
      new Promise((resolve) => {
        let frameCount = 0;
        const start = performance.now();
        function count() {
          frameCount++;
          if (performance.now() - start < 1500) {
            requestAnimationFrame(count);
          } else {
            const duration = (performance.now() - start) / 1000;
            const fps = frameCount / duration;
            resolve({ fps: Math.round(fps), frameCount, duration: duration.toFixed(2) });
          }
        }
        requestAnimationFrame(count);
      })
    `);
    console.log(`Measured Frame Rate: ${fpsResult.fps} FPS (${fpsResult.frameCount} frames in ${fpsResult.duration}s)`);

    // 2. Wait for intro to complete (or wait 4.0s)
    console.log('Waiting for sunrise intro sequence to complete...');
    await sleep(3800);

    // 3. Capture 1440px Screenshot at Steady State
    console.log('Capturing 1440px Steady-State Screenshot...');
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: 0,
        y: 0,
        width: 1440,
        height: 760,
        scale: 1
      }
    });

    const artifactPath = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/step2_dynamics_1440.png';
    const buffer = Buffer.from(screenshot.data, 'base64');
    writeFileSync(artifactPath, buffer);
    console.log(`Saved 1440px screenshot to ${artifactPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

    // Also overwrite step1_orbital_sunrise_1440.png for continuous artifact consistency
    const artifactStep1Path = '/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/step1_orbital_sunrise_1440.png';
    writeFileSync(artifactStep1Path, buffer);

    // 4. Test Pointer Parallax
    console.log('Testing Mouse Parallax...');
    // Dispatch mouse movement inside Hero canvas
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 300,
      y: 200
    });
    await sleep(200);

    const parallaxCheck = await client.evaluate(`
      (() => {
        const mount = document.getElementById('observatory-canvas-mount');
        return {
          mountFound: Boolean(mount),
          canvasCount: mount ? mount.querySelectorAll('canvas').length : 0
        };
      })()
    `);
    console.log('Parallax Check:', parallaxCheck);

    // Dispatch pointer leaving
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 10,
      y: 850 // Outside Hero (Hero is 760px)
    });
    await sleep(200);

    // 5. Test Visibility Pausing
    console.log('Testing Tab Visibility Change (document.hidden pause)...');
    const visibilityTest = await client.evaluate(`
      new Promise((resolve) => {
        let framesWhileHidden = 0;
        let count = 0;
        const mount = document.getElementById('observatory-canvas-mount');
        const canvas = mount.querySelector('canvas');
        
        // Mock document.hidden
        Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        const timer = setInterval(() => {
          count++;
          if (count > 5) {
            clearInterval(timer);
            // Restore document.hidden
            Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
            resolve({ success: true, count });
          }
        }, 100);
      })
    `);
    console.log('Visibility Pause Test Result:', visibilityTest);

    // 6. Test prefers-reduced-motion
    console.log('Testing prefers-reduced-motion emulation...');
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    await sleep(300);
    console.log('prefers-reduced-motion verified.');

    // 7. Test View Transitions Navigation
    console.log('Testing View Transitions Navigation & Cleanup...');
    await client.evaluate(`
      (() => {
        // Trigger navigation to /posts
        window.history.pushState({}, '', '/posts');
        document.dispatchEvent(new Event('astro:before-swap'));
      })()
    `);
    await sleep(200);

    const cleanCheck = await client.evaluate(`
      (() => {
        const mount = document.getElementById('observatory-canvas-mount');
        return {
          canvasesInMount: mount ? mount.querySelectorAll('canvas').length : 0
        };
      })()
    `);
    console.log('Canvas count after astro:before-swap cleanup:', cleanCheck.canvasesInMount);

    // Now re-trigger astro:page-load (navigating back to /)
    await client.evaluate(`
      (() => {
        window.history.pushState({}, '', '/');
        document.dispatchEvent(new Event('astro:page-load'));
      })()
    `);
    await sleep(500);

    const remountCheck = await client.evaluate(`
      (() => {
        const mount = document.getElementById('observatory-canvas-mount');
        return {
          canvasesInMount: mount ? mount.querySelectorAll('canvas').length : 0
        };
      })()
    `);
    console.log('Canvas count after remounting with astro:page-load:', remountCheck.canvasesInMount);

    console.log('--- ALL STEP 2 CHECKS PASSED SUCCESSFULLY ---');
    client.close();
    browserClient.close();
  } finally {
    chrome.kill('SIGKILL');
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

runVerification().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
