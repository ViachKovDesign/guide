// node tools/render-products.js  — рендерит картинки в assets/img/p/*.jpg через headless Chromium (playwright-core).
// Нужен локальный сервер: python3 -m http.server 8123 в папке idodom.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
(async () => {
  const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const out = path.join(__dirname, '..', 'assets', 'img', 'p'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto(process.env.URL || 'http://127.0.0.1:8123/tools/render-products.html');
  await p.waitForFunction('window.RENDER_READY');
  const specs = await p.evaluate('window.SPECS');
  const only = process.argv.slice(2);
  for (let i = 0; i < specs.length; i++) {
    if (only.length && !only.includes(specs[i].id)) continue;
    const url = await p.evaluate(`window.renderSpec(${i})`);
    fs.writeFileSync(path.join(out, specs[i].id + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('ok', specs[i].id, specs[i].w + 'x' + specs[i].h);
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
