import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(20000);
for (let i = 0; i < 5; i++) {
  const c = await page.$('[data-folia-sheet] button[aria-label="关闭"]');
  if (!c) break;
  await c.click({ force: true }); await page.waitForTimeout(500);
}
await page.evaluate(() => { for (const el of document.querySelectorAll('div.fixed.inset-0')) { if (getComputedStyle(el).zIndex === '200') el.style.pointerEvents = 'none'; } });
const edge = await page.$('.scratchpad-edge');
const eb = await edge.boundingBox();
await page.screenshot({ path: 'test/ui/_tmpEdge0.png', clip: { x: 1180, y: 40, width: 100, height: 220 } });
await page.mouse.move(eb.x + 20, eb.y + eb.height / 2);

await page.waitForTimeout(500);
await page.screenshot({ path: 'test/ui/_tmpEdge1.png', clip: { x: 1130, y: 40, width: 150, height: 220 } });
console.log('ok', JSON.stringify(eb));
await browser.close();
