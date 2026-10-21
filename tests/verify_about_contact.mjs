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
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    return res.result ? res.result.value : null;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-about-test-'));
  const port = 9299;

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${tmpDir}`,
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
      height: 1200,
      deviceScaleFactor: 2,
      mobile: false
    });

    console.log('Navigating to http://127.0.0.1:4321/about ...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:4321/about' });
    await sleep(2000);

    // Scroll to contact section
    await client.evaluate(`document.querySelector('.about-section:last-of-type')?.scrollIntoView()`);
    await sleep(500);

    // Dark Mode Screenshot
    const darkShot = await client.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/about_contact_dark.png', Buffer.from(darkShot.data, 'base64'));
    console.log('Saved about_contact_dark.png');

    // Toggle to Light Mode
    await client.evaluate(`document.getElementById('theme-toggle')?.click()`);
    await sleep(600);

    // Light Mode Screenshot
    const lightShot = await client.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('/Users/cyrus/.gemini/antigravity/brain/63f441f1-6544-42fc-965f-05dca9a81787/about_contact_light.png', Buffer.from(lightShot.data, 'base64'));
    console.log('Saved about_contact_light.png');

    client.close();
    browserClient.close();
    chrome.kill();
    console.log('Verification Finished Successfully!');
  } catch (err) {
    chrome.kill();
    throw err;
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
