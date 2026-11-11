// Requires Chrome and Python Pillow; writes a preview of the current engine.
const { build } = require('esbuild');
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-preview-'));
  const bundle = await build({ stdin: { contents: "import { createSwarmRebuild } from './src/index'; window.play = () => createSwarmRebuild({ target: '#canvas', cursorCount: 24, introDuration: 1100, speed: 1.6 }).start();", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } });
  const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:35px;background:#eef1e9;color:#26372c;font:14px Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px}header b{font-size:22px;letter-spacing:-1px}header span{color:#71826c;font-size:12px}#canvas{background:#fff;border:1px solid #dce3d5;border-radius:14px;padding:35px;height:490px}small{color:#829176;letter-spacing:2px;font-size:10px}h1{font-size:39px;letter-spacing:-1.5px;margin:12px 0}p{color:#829176;line-height:1.6}.stats{display:flex;gap:18px;margin-top:28px}.stat{flex:1;padding:22px;background:#f5f7f0;border:1px solid #e3e9dc;border-radius:9px}.stat b{display:block;font-size:30px;margin-top:9px}.cards{display:flex;gap:18px;margin-top:20px}.card{flex:1;border:1px solid #e3e9dc;border-radius:9px;overflow:hidden}.art{height:88px;background:linear-gradient(130deg,#e4ebd5,#afc887);display:flex;align-items:center;justify-content:center;font-size:48px;color:#6e8652}.card:nth-child(2) .art{background:linear-gradient(120deg,#e5dff5,#bba9df);color:#8066b4}.card:nth-child(3) .art{background:linear-gradient(120deg,#f4e2d3,#ddb69a);color:#ab7e5c}.label{padding:14px;font-size:12px}footer{margin-top:20px;display:flex;justify-content:space-between;font-size:11px;color:#829176}
  </style><header><b>↗ swarm / react</b><span>A little teamwork. Every pixel.</span></header><main id="canvas"><small>REACT SWARM REBUILD</small><h1>Your interface. Built by a swarm.</h1><p>Tiny cursors draw, type and bring your UI to life.</p><div class="stats"><div class="stat">Projects in motion<b>24</b></div><div class="stat">Progress this week<b>86%</b></div><div class="stat">Ideas worth exploring<b>128</b></div></div><div class="cards"><div class="card"><div class="art">◈</div><div class="label">A softer system</div></div><div class="card"><div class="art">✳</div><div class="label">Room to grow</div></div><div class="card"><div class="art">◯</div><div class="label">Good form</div></div></div></main><footer><span>Nguyễn Quốc Cường · MIT</span><span>React 18 / 19 · TypeScript</span></footer><script src="/bundle.js"></script>`;
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].text : html); });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 960, height: 660 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => window.play());
    for (let i = 0; i < 100; i++) { await page.screenshot({ path: path.join(temp, `${String(i).padStart(3, '0')}.png`) }); await page.waitForTimeout(90); }
    fs.mkdirSync('assets', { recursive: true });
    execFileSync('python3', ['-c', `from PIL import Image
from pathlib import Path
import sys
frames=[Image.open(p).convert('RGB').resize((800,550)).quantize(colors=128) for p in sorted(Path(sys.argv[1]).glob('*.png'))]
frames[0].save('assets/demo.gif',save_all=True,append_images=frames[1:],duration=[110]*99+[1800],loop=0,optimize=True)`, temp]);
    console.log('Wrote assets/demo.gif');
  } finally { if (browser) await browser.close(); server.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
