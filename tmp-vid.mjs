import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
for (const url of ['http://localhost:3123/dev-probe.html?probe=playerLayout', 'http://localhost:3123/dev-probe.html?probe=dockedPlayerBar&isPlayer=0']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 200)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => ({ videos: document.querySelectorAll('video').length, body: document.body.innerText.slice(0, 60).replace(/\n/g, ' | ') }));
  console.log(url.split('probe=')[1], JSON.stringify(info), 'errors:', errors.length ? errors : 'none');
  await page.close();
}
await browser.close();
