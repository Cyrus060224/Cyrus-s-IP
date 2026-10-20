import { spawn } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
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

  close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// SVG Vector definitions
const rawMobiusPath = "M80 24 C64 12 40 14 26 26 C12 38 10 60 22 74 C34 88 58 90 76 80 C84 75 88 66 84 58 C80 50 70 48 64 54 C54 62 40 60 34 52 C28 44 30 34 38 28 C48 20 64 22 72 30 C76 34 84 32 86 26 C88 22 84 18 80 24 Z";
const rawCircle = `<circle cx="56" cy="46" r="5" fill="currentColor"/>`;

function createHtmlTemplate({ color, glow, bg = 'transparent' }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2048px;
    height: 2048px;
    background: ${bg};
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .container {
    width: 1600px;
    height: 1600px;
    color: ${color};
    ${glow ? `filter: drop-shadow(0 0 60px ${glow});` : ''}
  }
  svg {
    width: 100%;
    height: 100%;
  }
</style>
</head>
<body>
  <div class="container">
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="${rawMobiusPath}" fill="currentColor"/>
      <circle cx="56" cy="46" r="5" fill="currentColor"/>
    </svg>
  </div>
</body>
</html>`;
}

function createLockupHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=JetBrains+Mono:wght@500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 3200px;
    height: 1200px;
    background: #06080D;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', -apple-system, sans-serif;
  }
  .brand-wrap {
    display: flex;
    align-items: center;
    gap: 90px;
  }
  .logo-box {
    width: 440px;
    height: 440px;
    color: #8FC4FF;
    filter: drop-shadow(0 0 50px rgba(143, 196, 255, 0.4));
  }
  .text-box {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .title {
    font-size: 200px;
    font-weight: 700;
    color: #FFFFFF;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .subtitle {
    font-family: 'JetBrains Mono', monospace;
    font-size: 46px;
    color: #8FC4FF;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 30px;
  }
  .badge {
    padding: 6px 24px;
    border: 2px solid rgba(143, 196, 255, 0.4);
    border-radius: 12px;
    background: rgba(143, 196, 255, 0.1);
    font-size: 38px;
  }
</style>
</head>
<body>
  <div class="brand-wrap">
    <div class="logo-box">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="${rawMobiusPath}" fill="currentColor"/>
        <circle cx="56" cy="46" r="5" fill="currentColor"/>
      </svg>
    </div>
    <div class="text-box">
      <div class="title">CYRUS</div>
      <div class="subtitle">
        <span>IDENTITY & INNOVATION</span>
        <span class="badge">EST. 2026</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function exportAssets() {
  const destDir = '/Users/cyrus/Desktop/Cyrus_Logo_HD';
  mkdirSync(destDir, { recursive: true });

  // 1. Save standard SVG vector master file
  const masterSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Cyrus Personal & Brand Logo · Titan 3 Gravitational Mobius (The Gravity Loop) -->
  <path d="${rawMobiusPath}" fill="#8FC4FF"/>
  <circle cx="56" cy="46" r="5" fill="#8FC4FF"/>
</svg>`;
  writeFileSync(join(destDir, 'Cyrus_Logo_Vector.svg'), masterSvg);
  writeFileSync('/Users/cyrus/Desktop/Cyrus_Logo_Vector.svg', masterSvg);
  console.log('Saved Cyrus_Logo_Vector.svg');

  // Start Chrome
  const tmpDir = mkdtempSync(join(tmpdir(), 'chrome-export-'));
  const port = 9295;
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

    // 2. Export 1: Dark Mode Ultra HD (Cyber Ice Blue with Glow)
    console.log('Exporting Dark Mode 4K PNG...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 2048,
      height: 2048,
      deviceScaleFactor: 2, // 2048 * 2 = 4096px
      mobile: false
    });
    const darkHtml = createHtmlTemplate({
      color: '#8FC4FF',
      glow: 'rgba(143, 196, 255, 0.4)'
    });
    await client.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(darkHtml) });
    await sleep(600);
    const darkPng = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(join(destDir, 'Cyrus_Logo_Dark_4K.png'), Buffer.from(darkPng.data, 'base64'));
    // Also save directly on Desktop as requested
    writeFileSync('/Users/cyrus/Desktop/Cyrus_Logo_HD_Dark.png', Buffer.from(darkPng.data, 'base64'));

    // 3. Export 2: Light Mode Ultra HD (Obsidian Steel Blue)
    console.log('Exporting Light Mode 4K PNG...');
    const lightHtml = createHtmlTemplate({
      color: '#1E293B',
      glow: null
    });
    await client.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(lightHtml) });
    await sleep(600);
    const lightPng = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(join(destDir, 'Cyrus_Logo_Light_4K.png'), Buffer.from(lightPng.data, 'base64'));
    writeFileSync('/Users/cyrus/Desktop/Cyrus_Logo_HD_Light.png', Buffer.from(lightPng.data, 'base64'));

    // 4. Export 3: Pure Monochrome White (for dark print/t-shirt)
    console.log('Exporting Pure White 4K PNG...');
    const whiteHtml = createHtmlTemplate({
      color: '#FFFFFF',
      glow: null
    });
    await client.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(whiteHtml) });
    await sleep(600);
    const whitePng = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(join(destDir, 'Cyrus_Logo_Monochrome_White_4K.png'), Buffer.from(whitePng.data, 'base64'));

    // 5. Export 4: Luxury Metallic Gold
    console.log('Exporting Luxury Gold 4K PNG...');
    const goldHtml = createHtmlTemplate({
      color: '#D4AF37',
      glow: 'rgba(212, 175, 55, 0.4)'
    });
    await client.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(goldHtml) });
    await sleep(600);
    const goldPng = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(join(destDir, 'Cyrus_Logo_Gold_4K.png'), Buffer.from(goldPng.data, 'base64'));

    // 6. Export 5: Official Corporate Brand Lockup Banner
    console.log('Exporting Corporate Brand Lockup...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 3200,
      height: 1200,
      deviceScaleFactor: 1.5,
      mobile: false
    });
    const lockupHtml = createLockupHtml();
    await client.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(lockupHtml) });
    await sleep(1000);
    const lockupPng = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(join(destDir, 'Cyrus_Brand_Lockup_HD.png'), Buffer.from(lockupPng.data, 'base64'));
    writeFileSync('/Users/cyrus/Desktop/Cyrus_Brand_Lockup_HD.png', Buffer.from(lockupPng.data, 'base64'));

    // 7. Write README guide
    const readmeContent = `# Cyrus Brand Identity System (VI) · Asset Guide

## 标志名称
Titan 3 · 引力莫比乌斯 (The Gravity Loop - Centripetal Core)

## 设计哲学与符号学释义
- **拓扑连续性（Continuous Mobius Loop）**：非定向单侧曲面，象征永不停歇的认知自驱动迭代、自省与无界探索。
- **引力天体核心（Gravitational Singularity）**：回旋环心包裹着不可撼动的核心奇点，呼应 Cyrus（古波斯语：太阳 / 恒星）的引力中心。
- **宏观字形与微观识别**：宏观上构成字母“C”的大气轮廓，在 16px~4096px 极值全尺度下均有顶级穿透力。

## 导出的文件列表
1. **Cyrus_Logo_Vector.svg**: 矢量母文件（无损放大，适用于 Adobe Illustrator、Figma、工业激光切割、商标注册）。
2. **Cyrus_Logo_Dark_4K.png**: 4096 × 4096 px 超清透明底深色版（赛博冰蓝 #8FC4FF 辉光）。
3. **Cyrus_Logo_Light_4K.png**: 4096 × 4096 px 超清透明底浅色版（曜石深钢蓝 #1E293B）。
4. **Cyrus_Logo_Monochrome_White_4K.png**: 4096 × 4096 px 纯白印刷版（适用于深色底、文化衫刺绣、钢印）。
5. **Cyrus_Logo_Gold_4K.png**: 4096 × 4096 px 奢华香槟金（适用于名片烫金、前台发光立体金属字、VIP 礼盒）。
6. **Cyrus_Brand_Lockup_HD.png**: 官方横向品牌组合展板（图形标 + CYRUS 标准字）。

## 核心色彩代码
- **深色主题核心色 (Cyber Ice Blue)**: \`#8FC4FF\`
- **浅色主题核心色 (Obsidian Steel)**: \`#1E293B\`
- **尊享金属色 (Champagne Gold)**: \`#D4AF37\`
`;
    writeFileSync(join(destDir, 'README.md'), readmeContent);

    client.close();
    browserClient.close();
    chrome.kill();
    console.log('ALL ASSETS GENERATED SUCCESSFULLY ON DESKTOP!');
  } catch (err) {
    chrome.kill();
    throw err;
  }
}

exportAssets().catch(err => {
  console.error(err);
  process.exit(1);
});
