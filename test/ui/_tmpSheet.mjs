import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
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
await page.mouse.move(eb.x + 20, eb.y + eb.height / 2);
await page.waitForTimeout(350);
await (await page.$('[data-testid="scratchpad-handle"]')).click({ force: true });
await page.waitForTimeout(900);
const expand = await page.$('.scratchpad-band-expand');
const xb = await expand.boundingBox();
console.log('expand', JSON.stringify(xb));
await page.mouse.click(xb.x + 16, xb.y + 16);
await page.waitForTimeout(1200);
const m = await page.evaluate(() => {
  const r = el => el ? (b => [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)])(el.getBoundingClientRect()) : null;
  return { sheet: r(document.querySelector('[data-testid="scratchpad-drawer"]')), f: r(document.querySelector('.scratchpad-f')), page: document.querySelector('[data-testid="scratchpad-drawer"]')?.getAttribute('data-page') };
});
console.log(JSON.stringify(m));
await page.screenshot({ path: 'test/ui/_tmpSheet.png' });
await browser.close();
